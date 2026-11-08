# MundaLink

MundaLink is a small website for the Grok Bot Lusaka Hackathon (21 November 2026). It helps a small-scale farmer in Zambia list produce, and helps a buyer find what is actually available.

The tagline is: **Grow more. Waste less. Earn better.**

The sample farmers, listings, and prices in this project are **fictional demo data**. They are labelled **Demo data** on the page. Market prices do not include a made-up kwacha amount.

## What you need

- [Node.js](https://nodejs.org/) 18 or newer. Check with:

```bash
node --version
```

You do not need to install any extra packages. There is no database to set up.

## Run it on your computer

1. Open a terminal in this project folder.
2. Start the site:

```bash
node server.js
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

You should see the MundaLink name, the tagline, the sample produce, and the market prices. Chat will say that an API key is missing. That is expected until you add one. Listings and prices work without a key.

Stop the server with `Ctrl+C`.

`npm start` does the same thing as `node server.js`.

If port 3000 is already in use, set another port (see below) and open that address instead.

## Turn on the chat

The chat uses xAI's Grok API. You need your own key.

1. Create a key at [console.x.ai](https://console.x.ai/).
2. In this folder, copy the example env file:

```bash
cp .env.example .env
```

3. Open `.env` in a text editor. Put your key after the equals sign:

```bash
XAI_API_KEY=your_key_here
```

4. Save the file and start the server again (`node server.js`).

The key stays in `.env`. That file is ignored by git. Do not paste the key into the code, the README, or a chat message.

You can also set the key in the terminal for one session, without a `.env` file:

```bash
export XAI_API_KEY=your_key_here
node server.js
```

Optional settings in `.env`:

- `XAI_MODEL` — which Grok model to use. The default is `grok-4.7`.
- `PORT` — the port number. The default is `3000`.

## What the pages do

- **Home** shows the name and the tagline.
- **Produce** lists crops from `data/listings.json`. Phone numbers are never shown.
- **Prices** lists reports from `data/market_prices.json`, with the source, the date, and a Demo label.
- **Chat** asks Grok to register a farmer, search listings, or read prices. Grok can only save a listing after the farmer confirms. Saving writes a new row into the JSON files. Refresh the produce list and the new crop is there.

## Edit the demo data

The database is three text files:

| File | What it holds |
|---|---|
| `data/farmers.json` | Farmer name, place, phone, and whether they agreed to share the phone |
| `data/listings.json` | Crop, quantity, unit, asking price, place, and status |
| `data/market_prices.json` | Price reports. Leave `price` as `null` until you have a real, dated source |

Open a file, change a value, save it, and refresh the browser. You do not need to restart the server.

Keep the quotes and commas. `demo: true` marks a fictional row. A listing added from the chat is saved with `demo: false`.

Do not delete a sold listing. Change `"status"` to `"Sold"` instead. Sold rows stay on the page and drop out of buyer search.

To put the original sample data back, run this from the project folder if you use git:

```bash
git checkout -- data
```

## Demo script

Use made-up phone numbers. The sample numbers are `DEMO-001` and `DEMO-002`.

### 1. Farmer registration

In the chat, type:

`I want to sell tomatoes`

Answer one question at a time, for example:

- Name: `John Banda`
- Place: `Chongwe`
- Quantity: `20 bags`
- Price: `K250 per bag`
- Phone: `DEMO-003`, and say **Yes** if buyers may be given the number

MundaLink should show a summary like:

`John Banda · Tomatoes · 20 bags · Chongwe · K250 per bag`

Type: `Yes, save it`

It should tell you the listing was saved and give it an id such as `L003`. Click **Refresh** on the produce list. The new tomatoes row should be there, and the phone number should not be on the card.

If you have not confirmed yet, it must not say the listing was saved.

### 2. Buyer search

Type:

`I need 10 bags of tomatoes in Chongwe`

It should find the Chongwe tomatoes (20 bags at K250 per bag) and say the total for 10 bags is K2,500. Contact is mentioned only as available because the farmer agreed. It should not invent another farmer.

### 3. No match

Type:

`I need onions in Chongwe`

It should say it could not find onions. It should not invent a seller or a price.

### Extra checks

- `What is the market price of maize?` — it should say the stored row is demo data, and give the source and the date. It should not invent a kwacha amount.
- `How should I store maize after harvest?` — short practical tips. For pests or food safety, it should point you to an extension officer.

## Run the tests

The tests use a copy of the demo files and a pretend Grok API, so they do not need a key and they do not call xAI.

```bash
node --test
```

`npm test` is the same command.

## Files

- `server.js` — starts the website
- `lib/store.js` — reads and writes the JSON files, and applies the matching rules
- `lib/chat.js` — calls Grok and runs the tools
- `lib/prompt.js` — the chatbot instructions
- `public/` — the page (HTML, CSS, and plain JavaScript)
- `data/` — the demo database
- `test/mundalink.test.js` — checks for privacy, search, saving, and the missing-key message

## What this demo does not do

No mobile money, delivery, GPS, ID checks, WhatsApp, or a phone app. It is a 4-hour hackathon demo: one page, three JSON files, and a chat assistant.
