# Mistral scheduling setup

Create a `.env.local` file in the project root and add your Gemini key:

```env
MISTRAL_API_KEY=your_mistral_api_key_here
MISTRAL_MODEL=mistral-large-latest
```

Restart the development server after changing environment variables. The key is read only by the server-side scheduling route and must not use a `NEXT_PUBLIC_` prefix.

## Email notifications

Notification emails are sent only to the same resolved recipients who receive the in-app notification. Configure Gmail SMTP with a Google App Password:

```env
GMAIL_USER=your-account@gmail.com
GMAIL_APP_PASSWORD=your-16-character-app-password
EMAIL_FROM=Faculty Management <your-account@gmail.com>
```

Enable 2-Step Verification on the Gmail account, then create the App Password under Google Account security settings. Do not use the normal Gmail password. Email content uses the notification title and message, so status changes, notes, and schedule updates describe the actual update. If the SMTP settings are missing, in-app notifications continue to work and email delivery remains disabled.
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
