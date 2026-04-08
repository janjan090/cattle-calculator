# CattleFlow Pro

CattleFlow Pro is a browser-friendly cattle fattening planner built for quick 100-day finishing projections.
It includes:

- Live financial dashboard updates while typing
- Login and registration stored in browser local storage
- Saved projection scenarios per browser user
- Static-first deployment setup for Vercel free

## Features

- Compare `80% silage + 20% concentrate` versus `100% silage`
- Track net income, ROI, gross sale, break-even sale price, and feed cost
- Save, reload, and delete planning scenarios
- Use the app without a database for simple deployment

## Project Structure

```text
.
|-- index.html
|-- public/
|   |-- app.js
|   `-- styles.css
|-- server.js
|-- package.json
`-- vercel.json
```

## Run Locally

1. Open a terminal in the project folder.
2. Start the local server:

```bash
npm start
```

3. Open `http://localhost:3000`

## Deploy To Vercel

This project can be deployed from GitHub to Vercel free.

1. Push the repository to GitHub.
2. In Vercel, click `Add New Project`.
3. Import this repository.
4. Keep the default settings.
5. Deploy.

The included [vercel.json](./vercel.json) is already suitable for this static-first setup.

## Important Note About Storage

This version uses browser `localStorage` for accounts and saved projections.

That means:

- Data is stored per browser/device
- Users on different devices will not share accounts or saved scenarios
- This is good for demo use and free static hosting
- It is not a full production auth/data stack

## Next Upgrade Path

If you want real multi-device login and cloud-synced projections, the next step is connecting the app to a backend such as:

- Supabase
- Firebase
- Vercel Postgres + server-side auth

## License

Private project.
