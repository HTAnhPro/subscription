#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token,
    Address, Env,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AmountMustBePositive = 1,
    NotFound = 2,
    NotMerchant = 3,
    NotSubscriber = 4,
    NotYetDue = 5,
    AlreadyComplete = 6,
    AlreadyCancelled = 7,
    NotInitialized = 8,
}

#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Status {
    Active = 0,
    Cancelled = 1,
    Completed = 2,
}

#[contracttype]
#[derive(Clone)]
pub struct Subscription {
    pub subscriber: Address,
    pub merchant: Address,
    pub per_period: i128,
    pub periods: u32,
    pub claimed: u32,
    pub period_seconds: u64,
    pub opened_at: u64,
    pub status: Status,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Xlm,
    NextId,
    Sub(u64),
}

fn xlm(env: &Env) -> Result<token::Client<'_>, Error> {
    let addr: Address = env
        .storage()
        .instance()
        .get(&DataKey::Xlm)
        .ok_or(Error::NotInitialized)?;
    Ok(token::Client::new(env, &addr))
}

#[contract]
pub struct SubscriptionVault;

#[contractimpl]
impl SubscriptionVault {
    pub fn __constructor(env: Env, xlm: Address) {
        env.storage().instance().set(&DataKey::Xlm, &xlm);
        env.storage().instance().set(&DataKey::NextId, &0u64);
    }

    pub fn create(
        env: Env,
        subscriber: Address,
        merchant: Address,
        per_period: i128,
        periods: u32,
        period_seconds: u64,
    ) -> Result<u64, Error> {
        subscriber.require_auth();
        if per_period <= 0 || periods == 0 || period_seconds == 0 {
            return Err(Error::AmountMustBePositive);
        }

        // pull the full commit into escrow up front
        let total = per_period * periods as i128;
        let t = xlm(&env)?;
        t.transfer(&subscriber, &env.current_contract_address(), &total);

        let id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(0);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));

        let sub = Subscription {
            subscriber: subscriber.clone(),
            merchant: merchant.clone(),
            per_period,
            periods,
            claimed: 0,
            period_seconds,
            opened_at: env.ledger().timestamp(),
            status: Status::Active,
        };
        env.storage().persistent().set(&DataKey::Sub(id), &sub);

        env.events().publish(
            (symbol_short!("created"), subscriber, merchant),
            (per_period, periods, period_seconds),
        );
        Ok(id)
    }

    pub fn claim(env: Env, merchant: Address, sub_id: u64) -> Result<i128, Error> {
        merchant.require_auth();
        let mut sub: Subscription = env
            .storage()
            .persistent()
            .get(&DataKey::Sub(sub_id))
            .ok_or(Error::NotFound)?;

        if sub.merchant != merchant {
            return Err(Error::NotMerchant);
        }
        if sub.status != Status::Active {
            return Err(Error::AlreadyComplete);
        }
        if sub.claimed >= sub.periods {
            return Err(Error::AlreadyComplete);
        }

        let now = env.ledger().timestamp();
        let elapsed = now.saturating_sub(sub.opened_at);
        let due_periods = (elapsed / sub.period_seconds) as u32;
        if due_periods <= sub.claimed {
            return Err(Error::NotYetDue);
        }

        let to_claim = core::cmp::min(due_periods, sub.periods) - sub.claimed;
        sub.claimed += to_claim;
        if sub.claimed == sub.periods {
            sub.status = Status::Completed;
        }
        env.storage().persistent().set(&DataKey::Sub(sub_id), &sub);

        let amount = sub.per_period * to_claim as i128;
        // release this period's worth from escrow to the merchant
        let t = xlm(&env)?;
        t.transfer(&env.current_contract_address(), &merchant, &amount);

        env.events().publish(
            (symbol_short!("claimed"), merchant, sub.subscriber.clone()),
            (amount, sub.claimed),
        );
        Ok(amount)
    }

    pub fn cancel(env: Env, subscriber: Address, sub_id: u64) -> Result<i128, Error> {
        subscriber.require_auth();
        let mut sub: Subscription = env
            .storage()
            .persistent()
            .get(&DataKey::Sub(sub_id))
            .ok_or(Error::NotFound)?;

        if sub.subscriber != subscriber {
            return Err(Error::NotSubscriber);
        }
        match sub.status {
            Status::Cancelled => return Err(Error::AlreadyCancelled),
            Status::Completed => return Err(Error::AlreadyComplete),
            Status::Active => {}
        }

        let unclaimed = sub.periods - sub.claimed;
        let refund = sub.per_period * unclaimed as i128;
        sub.status = Status::Cancelled;
        env.storage().persistent().set(&DataKey::Sub(sub_id), &sub);

        if refund > 0 {
            let t = xlm(&env)?;
            t.transfer(&env.current_contract_address(), &subscriber, &refund);
        }

        env.events()
            .publish((symbol_short!("cancelled"), subscriber), (refund, unclaimed));
        Ok(refund)
    }

    pub fn subscription_of(env: Env, sub_id: u64) -> Option<Subscription> {
        env.storage().persistent().get(&DataKey::Sub(sub_id))
    }

    pub fn next_id(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::NextId).unwrap_or(0)
    }

    pub fn claimable_now(env: Env, sub_id: u64) -> i128 {
        match env
            .storage()
            .persistent()
            .get::<_, Subscription>(&DataKey::Sub(sub_id))
        {
            None => 0,
            Some(s) if s.status != Status::Active || s.claimed >= s.periods => 0,
            Some(s) => {
                let now = env.ledger().timestamp();
                let elapsed = now.saturating_sub(s.opened_at);
                let due_periods = (elapsed / s.period_seconds) as u32;
                if due_periods <= s.claimed {
                    0
                } else {
                    let to_claim = core::cmp::min(due_periods, s.periods) - s.claimed;
                    s.per_period * to_claim as i128
                }
            }
        }
    }
}

#[cfg(test)]
mod test;
