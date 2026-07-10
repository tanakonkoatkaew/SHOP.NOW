"""Thin wrapper around the Stripe SDK for hosted Checkout (Payments only)."""
import os
import stripe


def _api():
    stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "").strip()
    return stripe


def is_configured():
    return bool(os.getenv("STRIPE_SECRET_KEY", "").strip())


def create_checkout_session(pending_id, amount_thb, item_count, success_url, cancel_url, customer_email=None):
    """Create a hosted Checkout Session for `amount_thb`. Returns the session."""
    s = _api()
    currency = os.getenv("STRIPE_CURRENCY", "thb").lower()
    label = f"SHOP.NOW คำสั่งซื้อ #{str(pending_id)[:8].upper()} ({item_count} รายการ)"
    return s.checkout.Session.create(
        mode="payment",
        line_items=[{
            "price_data": {
                "currency": currency,
                "product_data": {"name": label},
                # Stripe wants the amount in the smallest currency unit (satang)
                "unit_amount": int(round(float(amount_thb) * 100)),
            },
            "quantity": 1,
        }],
        success_url=success_url,
        cancel_url=cancel_url,
        client_reference_id=str(pending_id),
        metadata={"pending_order_id": str(pending_id)},
        payment_intent_data={"metadata": {"pending_order_id": str(pending_id)}},
        customer_email=(customer_email or None),
    )


def retrieve_session(session_id):
    return _api().checkout.Session.retrieve(session_id)


def construct_webhook_event(payload, sig_header):
    """Verify a webhook payload against STRIPE_WEBHOOK_SECRET and return the event."""
    secret = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
    return _api().Webhook.construct_event(payload, sig_header, secret)
