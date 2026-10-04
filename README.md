# Everchef Tech Supply

Storefront for **Everchef Tech Supply LLC** (East McKeesport, PA): refined kitchen hardware and home electronics, with a cart and a working Stripe Checkout.

## What's included

| Page | File |
| --- | --- |
| Home | `public/index.html` |
| About Us | `public/about.html` |
| Shop (with category filters) | `public/products.html` |
| Product detail | `public/product.html?id=…` |
| Cart | `public/cart.html` |
| Checkout (Stripe) | `public/checkout.html` → Stripe → `public/success.html` |
| Contact Us + form | `public/contact.html` |
| Shipping Policy | `public/shipping.html` |
| Returns & Refunds | `public/returns.html` |
| Terms & Conditions | `public/terms.html` |
| Privacy Policy | `public/privacy.html` |
| Legal Notice | `public/legal.html` |

There's also a cookie consent banner on every page. Visitors can reopen it with "Cookie Preferences" in the footer.

- **Products and prices** live in one file, `public/data/products.json`. Prices are in cents (`12900` = $129.00). The server reads this same file when it creates a checkout, so whatever you set there is what customers are charged.
- **Styling** is in `public/css/styles.css`. **Behavior** (header, footer, cart, cookie banner, sparkle background) is in `public/js/main.js`.
- **Business details** (email, phone, location) are at the top of `public/js/main.js` and in the policy pages.

## Run it locally

Requires Node.js 18 or newer.

```bash
npm install
cp .env.example .env      # then add your Stripe key
npm start                 # http://localhost:3000
```

## Connect Stripe

1. Create a Stripe account at https://dashboard.stripe.com.
2. Copy your **secret key** from Developers → API keys into `.env` as `STRIPE_SECRET_KEY`. Use the `sk_test_…` key first and pay with the test card `4242 4242 4242 4242`, any future date and any CVC.
3. When everything works, switch to your `sk_live_…` key.
4. *(Optional)* Turn on **Stripe Tax** in the dashboard and set `STRIPE_AUTOMATIC_TAX=true` to collect sales tax automatically.
5. *(Optional)* Add a webhook endpoint at `https://YOURDOMAIN/api/stripe/webhook` for the `checkout.session.completed` event, and put its signing secret in `STRIPE_WEBHOOK_SECRET`. Paid orders are logged on the server. Stripe also emails receipts and lists every order in your dashboard.

Stripe collects the shipping address, phone number and payment on its own secure page. Shipping is free on orders of $75 or more; otherwise standard is $9.95 and expedited is $24.95. You can change these amounts in `products.json`.

## Contact form email

Fill in the `SMTP_*` values in `.env` to have form submissions emailed to `everchef.tech@outlook.com`. Without them, the form opens the visitor's own email app with their message already filled in, so no message is lost.

## Deploying

Checkout and the contact form need the Node server, so deploy to a host that runs Node, such as Render, Railway, Fly.io, Heroku or a VPS:

- **Build command:** `npm install`
- **Start command:** `npm start`
- **Environment variables:** the same ones as in `.env`. Set `SITE_URL` to your live domain, for example `https://everchef.shop`.

## Images

Product and background photos are loaded from Unsplash (free license, credited in the Legal Notice). Before launch, replace them with photos of the exact items you sell: change each product's `image` URL in `products.json`.
