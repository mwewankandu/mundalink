# MundaLink

MundaLink is a small website for the Grok Bot Lusaka Hackathon (21 November 2026). It helps a small-scale farmer in Zambia list produce, and helps a buyer find what is actually available.

The tagline is: **Grow more. Waste less. Earn better.**

## Why MundaLink

This idea started when I talked with my grandfather. He farms on a small scale, and he told me his produce was going to waste because he could not find buyers.

He and other farmers around him had also been told that the government has not released funds to the Food Reserve Agency (FRA) to buy their crops. The reason they were given is that the FRA says it has already stocked enough to last until 2028. Farmers like my grandfather need another way to reach buyers directly. That is what MundaLink is for.

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
| `data/glossary.json` | Bemba and Nyanja words for crops and units. The English word is what gets saved |

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

### 4. Local language

Above the chat, choose **Chinyanja**. The greeting and the box hint should change. Type:

`Ndine na matumba 20 ya tomato ku Chongwe`

MundaLink should treat that as 20 bags of tomatoes in Chongwe, ask the remaining questions in Nyanja, and repeat the crop, quantity, price, and place before it saves. After a save, the produce card must say **Tomatoes** and **bags** in English, not "matumba".

Then choose **Ichibemba** and type:

`Ndefwaya ukushita amataba 10 ku Lusaka`

It should search the Lusaka maize (15 bags at K340 per bag) and reply in Bemba. It should not invent another farmer.

### 5. Voice

Use Chrome or Edge, on this computer (`http://localhost:3000`) or a secure `https` page. Allow the microphone when the browser asks. Speech recognition needs an internet connection.

1. Turn **Speaker** on if you want to hear the reply.
2. Press the microphone, say `I want to sell tomatoes`, and pause. The words should land in the box and send when you stop. Press **Stop** if you want to cut it short.
3. Turn **Conversation** on for a back-and-forth: after MundaLink finishes speaking, it listens again. Press **Conversation on** once more to turn that off. Turning the speaker off also turns conversation mode off.

On Ichibemba or Chinyanja, the mic uses those languages only when the browser has a matching voice. Otherwise it listens in English and says so.

## Voice

The mic, the speaker, and conversation mode use the browser's own speech tools. There is no extra package and no paid voice service.

- **Chrome or Edge.** Firefox does not offer speech-to-text here, so the mic stays hidden and a short note tells you to use Chrome or Edge. Typing still works.
- **Microphone permission.** If you block it, the chat says so and you can type instead.
- **Internet.** Chrome sends the recording to its speech service, so the mic needs a connection.
- **Address.** Use `http://localhost:3000` while you are testing, or `https` on a public site. A plain `http` address on another computer will not open the mic.
- **Speaker** is remembered in this browser. Replies are read aloud with markdown and emoji removed, so a line like `**Tomatoes** · 20 bags` is spoken as "Tomatoes, 20 bags".
- **Conversation** waits until the reply has been spoken, then listens again. Turn it off when you are done.
- English speech uses Zambian English when the browser has it, and British English otherwise. Bemba (`bem-ZM`) and Nyanja (`ny-MW`) are used only when a matching voice is installed.

## Languages

A farmer or buyer can write in English, Ichibemba (Bemba), Chinyanja (Nyanja/Chichewa), or a mix. MundaLink should answer in the language they used. The buttons above the chat only change the greeting, the example questions, and the hint in the box. The reply still follows the words the person actually typed.

Crop names and units are saved in English, so a search for tomatoes still finds a listing that was typed as "phwetekere" or "tamati". Town names stay as the town: Chongwe, Lusaka. Numbers are not converted.

The word list is `data/glossary.json`. Open it, fix a spelling, save, and send another chat message. You do not need to restart the server.

**These Bemba and Nyanja translations were drafted with AI. They were not written by a native speaker.** Please have one Bemba speaker and one Nyanja speaker check the glossary and the phrases below before the demo. If a word is wrong, change the glossary. If a word is missing, MundaLink is supposed to ask, not guess.

### Chinyanja phrases to check

Each line is something to type. The note is what should happen.

1. `Moni. Ndine mlimi.` — greeting. MundaLink treats you as a farmer and replies in Nyanja.
2. `Ndifuna kugulitsa chimanga.` — you want to sell maize. It should ask for the missing details, one question at a time.
3. `Ndine na matumba 20 ya tomato ku Chongwe.` — 20 bags of tomatoes in Chongwe. The number 20 must stay 20.
4. `Ndifuna matumba 10 ya tomato ku Chongwe.` — buyer search. It should find the Chongwe tomatoes and say the total for 10 bags.
5. `Ndifuna anyezi ku Chongwe.` — onions. It should say there is no listing. It should not invent a seller.
6. `Mtengo wa chimanga ndi wotani?` — maize price. It should say the stored row is demo data, with the source and the date, and no made-up kwacha amount.
7. `Phwetekere ndi zingati?` — tomato price. Same rule: no invented price.
8. `Kabichi 12 mabokosi ku Kafue.` — 12 crates of cabbage in Kafue.
9. `Mtedza matumba 5.` — 5 bags of groundnuts.
10. `Nyemba ku Lusaka.` — beans in Lusaka.
11. `Chinangwa.` — cassava. It should ask what you want to do with it.
12. `Mbatata ku Chongwe.` — sweet potatoes in Chongwe.
13. `Nthochi 30 kg.` — 30 kg of bananas. 30 stays 30.
14. `Inde, sungani.` — yes, save, but only after it has shown the summary. The card is in English.
15. `Ayi, musagawane nambala yanga.` — no, do not share the phone number.

### Ichibemba phrases to check

1. `Muli shani. Ndi mulimi.` — greeting. It should reply in Bemba and treat you as a farmer.
2. `Ndefwaya ukushitisha amataba.` — you want to sell maize.
3. `Ndefwaya ukushita amataba 10 ku Lusaka.` — buy 10 bags of maize in Lusaka. It should find Mary Phiri's listing.
4. `Ndefwaya tamati imitumba 20 ku Chongwe.` — 20 bags of tomatoes in Chongwe.
5. `Umutengo wa amataba ni shinga?` — maize price. Demo only, with source and date. No invented amount.
6. `Kalundwe ku Lusaka.` — cassava in Lusaka.
7. `Kabichi ku Lusaka.` — cabbage in Lusaka.
8. `Imbalala.` — groundnuts. It should ask what you want to do.
9. `Umupunga.` — rice.
10. `Cilashi ku Chongwe.` — potatoes in Chongwe.
11. `Amataba ku Chongwe.` — maize in Chongwe. The real maize listing is in Lusaka, so it should say this is not an exact match and offer that listing.
12. `Ee, yasaleni.` — yes, save, only after the summary. The card is in English.
13. `Awe, mwishibisha inambala yandi.` — no, do not share the phone number.
14. `Itaba 15 ku Lusaka.` — 15 of maize in Lusaka. 15 stays 15.
15. `Ndefwaya ifisashi.` — this word is not in the glossary. MundaLink should ask what the crop is, not guess.

## Run the tests

The tests use a copy of the demo files and a pretend Grok API, so they do not need a key and they do not call xAI.

```bash
node --test
```

`npm test` is the same command.

## Files

- `server.js` — starts the website
- `lib/store.js` — reads and writes the JSON files, and applies the matching rules
- `lib/glossary.js` — turns known Bemba and Nyanja crop and unit words into English
- `lib/chat.js` — calls Grok and runs the tools
- `lib/prompt.js` — the chatbot instructions, including the language rules
- `public/` — the page (HTML, CSS, and plain JavaScript)
- `public/voice.js` — microphone, speaker, and conversation mode
- `data/` — the demo database
- `test/mundalink.test.js` — checks for privacy, search, saving, and the missing-key message

## What this demo does not do

No mobile money, delivery, GPS, ID checks, WhatsApp, or a phone app. It is a 4-hour hackathon demo: one page, three JSON files, and a chat assistant.
