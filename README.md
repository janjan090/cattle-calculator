# CattleFlow Pro

CattleFlow Pro is a Firebase-powered cattle finishing planner built for fast 100-day profitability projections.

Live app:
`https://cattleflow-pro.web.app`

## Features

- Live KPI dashboard updates while typing
- Firebase Authentication with email/password login
- Cloud Firestore saved projections per user
- Scenario comparison workflow for cattle finishing plans
- Firebase Hosting deployment support

## Project Structure

```text
.
|-- index.html
|-- firebase.json
|-- .firebaserc
|-- public/
|   |-- firebase-app.js
|   |-- firebase-config.js
|   |-- index.html
|   `-- styles.css
`-- vercel.json
```

## Firebase Setup

1. Create a Firebase project
2. Add a Web App in the Firebase console
3. Enable `Authentication -> Email/Password`
4. Create a `Firestore Database`
5. Replace the placeholder values in [public/firebase-config.js](./public/firebase-config.js)
6. Deploy to Firebase Hosting

## Firestore Rules

Use these rules for the `projections` collection:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /projections/{projectionId} {
      allow read, delete: if request.auth != null
        && request.auth.uid == resource.data.userId;

      allow create: if request.auth != null
        && request.auth.uid == request.resource.data.userId;
    }
  }
}
```

## Deploy To Firebase Hosting

Login:

```bash
npx firebase-tools login
```

Deploy:

```bash
npx firebase-tools deploy --only hosting
```

Current Firebase project:
`cattleflow-pro`

## Deploy To Vercel

This app can still be deployed to Vercel as a static frontend while Firebase handles auth and data.

1. Push the repo to GitHub
2. Import the repo into Vercel
3. Deploy with default static settings

## Notes

- Firebase web config is safe to expose in the client
- Firestore security rules are what protect your data
- Saved projections sync across devices for signed-in users
- The live app has been verified for register, login, and Firestore projection saving

## License

Private project.
