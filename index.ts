const fs = require('fs').promises;
const path = require('path');
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');
require('dotenv').config();
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_KEY });

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
    try {
        const content = await fs.readFile(TOKEN_PATH);
        const credentials = JSON.parse(content);
        return google.auth.fromJSON(credentials);
    } catch (err) {
        return null;
    }
}

/**
 * Serializes credentials to a file compatible with GoogleAuth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client: any) {
    const content = await fs.readFile(CREDENTIALS_PATH);
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    const payload = JSON.stringify({
        type: 'authorized_user',
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
    });
    await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
    let client = await loadSavedCredentialsIfExist();
    if (client) {
        return client;
    }
    client = await authenticate({
        scopes: SCOPES,
        keyfilePath: CREDENTIALS_PATH,
    });
    if (client.credentials) {
        await saveCredentials(client);
    }
    return client;
}


async function fetchNotionEntries() {
    const response = await notion.databases.query({
        database_id: process.env.NOTION_DATABASE_ID,
        filter: {
            property: "Status",
            select: {
                equals: "Active Queue"
            },
            // property: "Start date",
            // date: {
                
            // }
            
        },
        sorts: [
            {
                property: "Created time",
                direction: "ascending"
            }
        ]
    });
    
    let entries: any[] = [];
    let i = 0;

    for (const entry of response.results) {
        // console.log(entry.properties);
        // console.log("Title : " + entry.properties.Name.title[0].plain_text);
        // console.log(entry.properties['Start Date'].date.start);
        // console.log(entry.properties['Start Date'].date.end);
        // console.log("URL   : " + entry.url);

        let newEntry = {
            summary: entry.properties.Name.title[0].plain_text,
            description: entry.url,
            start: {
                dateTime: entry.properties['Start Date'].date.start,
            },
            end: {
                dateTime: entry.properties['Start Date'].date.end,
            },
        }

        entries.push(newEntry);

        i++;
    }
    
    return entries;
}


/**
 * Lists the next 10 events on the user's primary calendar.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function listEvents(auth: any) {
    const calendar = google.calendar({ version: 'v3', auth });
    const res = await calendar.events.list({
        calendarId: 'primary',
        timeMin: new Date().toISOString(),
        maxResults: 10,
        singleEvents: true,
        orderBy: 'startTime',
    });
    const events = res.data.items;
    if (!events || events.length === 0) {
        console.log('No upcoming events found.');
        return;
    }
    console.log('Upcoming 10 events:');
    events.map((event: any, i: any) => {
        const start = event.start.dateTime || event.start.date;
        console.log(`${start} - ${event.summary}`);
    });

    // const res1 = await calendar.calendarList.list({
    //     pageToken: null,
    // });

    // console.log(res1.data.items);
}

async function createEvent(auth: any, data: any) {
    const calendar = google.calendar({ version: 'v3', auth });
    const res = await calendar.events.insert({
        auth: auth,
        calendarId: process.env.CALENDARID,
        resource: data,
    }, function (err: any, event: any) {
        if (err) {
            console.log('There was an error contacting the Calendar service: ' + err);
            return;
        }
        console.log('Event created: %s', event.htmlLink);
    })
}

(async () => {
    try {
        const auth = await authorize();
        // listEvents(auth);

        // const event = {
        //     'summary': 'Google I/O 2015',
        //     'description': 'A chance to hear more about Google\'s developer products.',
        //     'start': {
        //         'dateTime': '2024-09-06T10:00:00.000+08:00',
        //     },
        //     'end': {
        //         'dateTime': '2024-09-06T13:00:00.000+08:00',
        //     },
        // };

        // await createEvent(auth, event);

        const entries = await fetchNotionEntries();

        for (const entry of entries) {
            createEvent(auth, entry);
            console.log(entry);
        }

    } catch (e) {
        console.error(e);
    }
})();