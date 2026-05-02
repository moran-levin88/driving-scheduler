/**
 * Run: node scripts/get-refresh-token.mjs
 * Then open the URL it prints, authorize, paste the code back.
 */
import { createServer } from 'http'
import { google } from 'googleapis'

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const REDIRECT = 'http://localhost:3001/callback'

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars first')
  process.exit(1)
}

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT)

const url = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',          // forces a new refresh_token every time
  scope: ['https://www.googleapis.com/auth/calendar'],
})

console.log('\n✅ פתחי את הקישור הזה בדפדפן:\n')
console.log(url)
console.log('\nאחרי האישור, הסקריפט יקבל את הטוקן אוטומטית.\n')

const server = createServer(async (req, res) => {
  const code = new URL(req.url, 'http://localhost:3001').searchParams.get('code')
  if (!code) { res.end('No code'); return }

  try {
    const { tokens } = await oauth2.getToken(code)
    res.end('<h2>✅ הצלחה! חזרי לטרמינל</h2>')
    console.log('\n🔑 REFRESH TOKEN החדש שלך:\n')
    console.log(tokens.refresh_token)
    console.log('\nעדכני את GOOGLE_REFRESH_TOKEN ב-Vercel עם הערך הזה ואז Redeploy.\n')
  } catch (err) {
    res.end('Error: ' + err.message)
    console.error(err)
  }

  server.close()
}).listen(3001)
