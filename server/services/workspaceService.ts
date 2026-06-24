import { google } from "googleapis";

/**
 * Creates an authorized OAuth2 client using the user's client-side Google access token.
 * This token is obtained from Firebase Auth Google Sign-In and passed to the server.
 */
export function getOAuth2Client(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return oauth2Client;
}

/**
 * 1. Fetch Google Calendar events for the upcoming week.
 */
export async function getUpcomingCalendarEvents(accessToken: string) {
  const auth = getOAuth2Client(accessToken);
  const calendar = google.calendar({ version: "v3", auth });

  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  console.log(`[WorkspaceService] Fetching calendar events between ${timeMin} and ${timeMax}`);

  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
  });

  return response.data.items || [];
}

/**
 * 2. Create calendar events/blocks for user focus sessions and habits.
 */
export async function createCalendarEvent(
  accessToken: string,
  eventData: {
    title: string;
    description?: string;
    startTime: string; // ISO string
    endTime: string; // ISO string
    colorId?: string; // Optional Google Calendar color code
  }
) {
  const auth = getOAuth2Client(accessToken);
  const calendar = google.calendar({ version: "v3", auth });

  console.log(`[WorkspaceService] Creating calendar event: "${eventData.title}"`);

  const response = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: eventData.title,
      description: eventData.description || "Auto-scheduled via FlowMind Companion",
      start: {
        dateTime: eventData.startTime,
      },
      end: {
        dateTime: eventData.endTime,
      },
      colorId: eventData.colorId || "5", // Default color ID (yellow/orange/blue depending on theme)
    },
  });

  return response.data;
}

/**
 * Helper function to decode base64url encoded strings.
 */
function decodeBase64(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

/**
 * Helper to parse the body text from a Gmail message payload.
 */
function getMessageBody(payload: any): string {
  if (!payload) return "";
  if (payload.body && payload.body.data) {
    return decodeBase64(payload.body.data);
  }
  if (payload.parts && payload.parts.length) {
    for (const part of payload.parts) {
      const body = getMessageBody(part);
      if (body) return body;
    }
  }
  return "";
}

/**
 * 3. Read unread Gmail headers containing potential deadlines.
 * Lists the top unread messages and parses subject, date, sender, and snippet.
 */
export async function getUnreadDeadlines(accessToken: string) {
  const auth = getOAuth2Client(accessToken);
  const gmail = google.gmail({ version: "v1", auth });

  console.log("[WorkspaceService] Listing unread Gmail messages...");

  // Search for unread messages in the inbox
  const listResponse = await gmail.users.messages.list({
    userId: "me",
    q: "is:unread label:INBOX",
    maxResults: 15,
  });

  const messages = listResponse.data.messages || [];
  const parsedEmails = [];

  for (const msg of messages) {
    if (!msg.id) continue;
    try {
      const msgDetails = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "full",
      });

      const headers = msgDetails.data.payload?.headers || [];
      const subject = headers.find((h) => h.name?.toLowerCase() === "subject")?.value || "No Subject";
      const from = headers.find((h) => h.name?.toLowerCase() === "from")?.value || "Unknown Sender";
      const date = headers.find((h) => h.name?.toLowerCase() === "date")?.value || "";
      const snippet = msgDetails.data.snippet || "";
      const body = getMessageBody(msgDetails.data.payload) || snippet;

      parsedEmails.push({
        id: msg.id,
        threadId: msg.threadId,
        from,
        subject,
        date,
        snippet,
        body,
      });
    } catch (err) {
      console.error(`[WorkspaceService] Failed to fetch details for message ${msg.id}:`, err);
    }
  }

  return parsedEmails;
}

/**
 * Helper to format RFC 822 compliant raw MIME email strings for drafts.
 */
function createRawEmail(to: string, from: string, subject: string, messageBody: string): string {
  const rawMessage = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    'Content-Type: text/html; charset="utf-8"',
    "MIME-Version: 1.0",
    "",
    messageBody,
  ].join("\r\n");

  return Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * 4. Generate and save draft emails into the user's Gmail Drafts folder.
 */
export async function saveGmailDraft(
  accessToken: string,
  draftData: {
    to: string;
    subject: string;
    body: string;
    fromEmail?: string;
  }
) {
  const auth = getOAuth2Client(accessToken);
  const gmail = google.gmail({ version: "v1", auth });

  console.log(`[WorkspaceService] Creating Gmail draft for: "${draftData.to}"`);

  const fromEmail = draftData.fromEmail || "me";
  const rawEmail = createRawEmail(draftData.to, fromEmail, draftData.subject, draftData.body);

  const response = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: {
        raw: rawEmail,
      },
    },
  });

  return response.data;
}
