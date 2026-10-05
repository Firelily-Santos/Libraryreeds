const express = require('express');
const path = require('path');
const Stripe = require('stripe');
require('dotenv').config();

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Middleware
app.use(express.json());
// Serve static HTML/assets from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Cancellation Endpoint
app.post('/api/cancel-subscription', async (req, res) => {
  const { subscriptionId } = req.body;

  if (!subscriptionId) {
    return res.status(400).json({ error: 'Subscription ID is required.' });
  }

  try {
    // Option A: Cancel at end of current billing period (Standard approach)
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    // Option B: Cancel immediately and revoke access right now
    // const subscription = await stripe.subscriptions.cancel(subscriptionId);

    return res.status(200).json({
      status: subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});