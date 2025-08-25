# Banger Bot Live - Nostr Feed

A pixel art themed Nostr feed viewer that subscribes to a specific npub and displays their kind 1 notes in real-time.

## Features

- 🎨 **Pixel Art Design**: Inspired by a retro dynamite illustration with vibrant orange background
- 📡 **Multi-Relay Support**: Connects to multiple Nostr relays for better coverage
- ⚡ **Real-time Updates**: Live subscription to kind 1 notes from the specified npub
- 📱 **Responsive Design**: Works on desktop and mobile devices
- 🔥 **Animated Elements**: Sparkling dynamite logo and smooth note animations

## Target Npub

The website is configured to subscribe to:
```
npub1w3yr9u8qp88732he57ekcxct6vraphhd3c63927tw5nte2yfmu0q6sjnaw
```

## Connected Relays

The website connects to these Nostr relays:
- `wss://relay.damus.io`
- `wss://nos.lol`
- `wss://relay.snort.social`
- `wss://relay.nostr.band`
- `wss://nostr.wine`
- `wss://relay.current.fyi`

## How to Run

1. **Simple HTTP Server**: Open a terminal in the project directory and run:
   ```bash
   # Python 3
   python -m http.server 8000
   
   # Python 2
   python -m SimpleHTTPServer 8000
   
   # Node.js (if you have http-server installed)
   npx http-server
   ```

2. **Open in Browser**: Navigate to `http://localhost:8000`

3. **View the Feed**: The website will automatically connect to relays and start displaying notes from the target npub.

## Technical Details

- **Frontend**: Pure HTML, CSS, and JavaScript
- **Nostr Library**: Uses `nostr-tools` for Nostr protocol handling
- **Styling**: Pixel art theme with CSS animations
- **Real-time**: WebSocket connections to multiple Nostr relays

## File Structure

```
banger-bot-live/
├── index.html      # Main HTML file
├── styles.css      # Pixel art styling
├── script.js       # Nostr functionality
└── README.md       # This file
```

## Features

- **Status Display**: Shows connection status, relay count, and note count
- **Note Cards**: Each note displays author, timestamp, content, and event ID
- **Auto-scroll**: Feed automatically scrolls to show newest notes
- **Memory Management**: Limits displayed notes to prevent performance issues
- **Error Handling**: Graceful handling of relay connection failures

## Browser Compatibility

Works in all modern browsers that support:
- WebSocket connections
- ES6+ JavaScript features
- CSS Grid and Flexbox

## Notes

- The website only displays kind 1 (text note) events with specific structure
- Events must have tags: ["e", eventId, relayUrl, "mention"] where relayUrl contains "relay."
- Only events matching the exact target structure are shown
- Notes are displayed newest first
- Content is truncated if longer than 200 characters
- The feed shows the last 100 notes to prevent memory issues
