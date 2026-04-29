#![cfg(test)]

use super::{Error, Status, SubscriptionVault, SubscriptionVaultClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, Env,
};

struct Ctx<'a> {
    env: Env,
    vault: SubscriptionVaultClient<'a>,
    xlm: TokenClient<'a>,
    xlm_admin: StellarAssetClient<'a>,
}

fn setup<'a>() -> Ctx<'a> {
    let env = Env::default();
    env.mock_all_auths();

    let issuer = Address::generate(&env);
    let xlm_sac = env.register_stellar_asset_contract_v2(issuer);
    let xlm_addr = xlm_sac.address();

    let vault_id = env.register(SubscriptionVault, (xlm_addr.clone(),));

    Ctx {
        env: env.clone(),
        vault: SubscriptionVaultClient::new(&env, &vault_id),
        xlm: TokenClient::new(&env, &xlm_addr),
        xlm_admin: StellarAssetClient::new(&env, &xlm_addr),
    }
}

fn fund(ctx: &Ctx, who: &Address, amount: i128) {
    ctx.xlm_admin.mint(who, &amount);
}

fn advance(env: &Env, seconds: u64) {
    env.ledger().with_mut(|li| {
        li.timestamp = li.timestamp.saturating_add(seconds);
    });
}

#[test]
fn create_records_subscription() {
    let ctx = setup();
    let alice = Address::generate(&ctx.env);
    let merch = Address::generate(&ctx.env);
    fund(&ctx, &alice, 12 * 10_000_000);

    let id = ctx.vault.create(&alice, &merch, &10_000_000, &12, &86_400);

    let sub = ctx.vault.subscription_of(&id).unwrap();
    assert_eq!(sub.per_period, 10_000_000);
    assert_eq!(sub.periods, 12);
    assert_eq!(sub.claimed, 0);
    assert_eq!(sub.status, Status::Active);
    // full commit must be escrowed in the contract
    assert_eq!(ctx.xlm.balance(&alice), 0);
}

#[test]
fn claim_after_one_period_succeeds() {
    let ctx = setup();
    let alice = Address::generate(&ctx.env);
    let merch = Address::generate(&ctx.env);
    fund(&ctx, &alice, 12 * 10_000_000);

    let id = ctx.vault.create(&alice, &merch, &10_000_000, &12, &86_400);
    advance(&ctx.env, 86_400);

    let amount = ctx.vault.claim(&merch, &id);
    assert_eq!(amount, 10_000_000);
    let sub = ctx.vault.subscription_of(&id).unwrap();
    assert_eq!(sub.claimed, 1);
    // merchant actually receives the period payment
    assert_eq!(ctx.xlm.balance(&merch), 10_000_000);
}

#[test]
fn claim_before_period_returns_error() {
    let ctx = setup();
    let alice = Address::generate(&ctx.env);
    let merch = Address::generate(&ctx.env);
    fund(&ctx, &alice, 12 * 10_000_000);

    let id = ctx.vault.create(&alice, &merch, &10_000_000, &12, &86_400);
    advance(&ctx.env, 1000);

    let r = ctx.vault.try_claim(&merch, &id);
    assert!(matches!(r, Err(Ok(Error::NotYetDue))));
    assert_eq!(ctx.xlm.balance(&merch), 0);
}

#[test]
fn cancel_refunds_unclaimed_periods() {
    let ctx = setup();
    let alice = Address::generate(&ctx.env);
    let merch = Address::generate(&ctx.env);
    fund(&ctx, &alice, 12 * 10_000_000);

    let id = ctx.vault.create(&alice, &merch, &10_000_000, &12, &86_400);
    advance(&ctx.env, 86_400);
    ctx.vault.claim(&merch, &id);

    let refund = ctx.vault.cancel(&alice, &id);
    assert_eq!(refund, 11 * 10_000_000);
    let sub = ctx.vault.subscription_of(&id).unwrap();
    assert_eq!(sub.status, Status::Cancelled);
    // refund of unclaimed periods returns to subscriber
    assert_eq!(ctx.xlm.balance(&alice), 11 * 10_000_000);
    assert_eq!(ctx.xlm.balance(&merch), 10_000_000);
}

#[test]
fn multiple_claims_accumulate() {
    let ctx = setup();
    let alice = Address::generate(&ctx.env);
    let merch = Address::generate(&ctx.env);
    fund(&ctx, &alice, 12 * 10_000_000);

    let id = ctx.vault.create(&alice, &merch, &10_000_000, &12, &86_400);

    advance(&ctx.env, 86_400);
    let one = ctx.vault.claim(&merch, &id);
    advance(&ctx.env, 86_400);
    let two = ctx.vault.claim(&merch, &id);
    advance(&ctx.env, 86_400);
    let three = ctx.vault.claim(&merch, &id);

    assert_eq!(one, 10_000_000);
    assert_eq!(two, 10_000_000);
    assert_eq!(three, 10_000_000);
    let sub = ctx.vault.subscription_of(&id).unwrap();
    assert_eq!(sub.claimed, 3);
    assert_eq!(ctx.xlm.balance(&merch), 30_000_000);
}

#[test]
fn claim_past_total_returns_error() {
    let ctx = setup();
    let alice = Address::generate(&ctx.env);
    let merch = Address::generate(&ctx.env);
    fund(&ctx, &alice, 2 * 10_000_000);

    let id = ctx.vault.create(&alice, &merch, &10_000_000, &2, &86_400);
    advance(&ctx.env, 86_400 * 2);
    ctx.vault.claim(&merch, &id);

    advance(&ctx.env, 86_400);
    let r = ctx.vault.try_claim(&merch, &id);
    assert!(matches!(r, Err(Ok(Error::AlreadyComplete))));
    let sub = ctx.vault.subscription_of(&id).unwrap();
    assert_eq!(sub.status, Status::Completed);
}

#[test]
fn cancel_then_claim_blocked() {
    let ctx = setup();
    let alice = Address::generate(&ctx.env);
    let merch = Address::generate(&ctx.env);
    fund(&ctx, &alice, 12 * 10_000_000);

    let id = ctx.vault.create(&alice, &merch, &10_000_000, &12, &86_400);
    ctx.vault.cancel(&alice, &id);
    advance(&ctx.env, 86_400);
    let r = ctx.vault.try_claim(&merch, &id);
    assert!(matches!(r, Err(Ok(Error::AlreadyComplete))));
}

#[test]
fn non_merchant_cannot_claim() {
    let ctx = setup();
    let alice = Address::generate(&ctx.env);
    let merch = Address::generate(&ctx.env);
    let stranger = Address::generate(&ctx.env);
    fund(&ctx, &alice, 12 * 10_000_000);

    let id = ctx.vault.create(&alice, &merch, &10_000_000, &12, &86_400);
    advance(&ctx.env, 86_400);

    let r = ctx.vault.try_claim(&stranger, &id);
    assert!(matches!(r, Err(Ok(Error::NotMerchant))));
}
