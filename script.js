// Nostr configuration
const TARGET_NPUB = 'npub1t83prys2hepmqmln9adygpg8z5fq2lse5v6grjhecagr09rya4qs78wxhz';
const RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.snort.social',
    'wss://relay.nostr.band',
    'wss://nostr.wine',
    'wss://relay.current.fyi'
];

// Global variables
let connectedRelays = 0;
let totalNotes = 0;
let notes = new Map(); // Use Map to store unique notes by ID
let relays = [];
let userProfiles = new Map(); // Store user profiles for usernames and pictures

// DOM elements
const connectionStatus = document.getElementById('connection-status');
const relayCount = document.getElementById('relay-count');
const noteCount = document.getElementById('note-count');
const notesFeed = document.getElementById('notes-feed');

// Initialize the application
async function init() {
    console.log('Initializing Banger Bot Live...');
    updateStatus('Connecting to relays...');
    
    // Connect to relays
    await connectToRelays();
    
    // Subscribe to the target npub
    await subscribeToNpub();
}

// Connect to multiple relays
async function connectToRelays() {
    const connectionPromises = RELAYS.map(async (relayUrl) => {
        try {
            const relay = window.NostrTools.relayInit(relayUrl);
            
            relay.on('connect', () => {
                console.log(`Connected to ${relayUrl}`);
                connectedRelays++;
                updateRelayCount();
                updateStatus(`Connected to ${connectedRelays} relays`);
            });
            
            relay.on('disconnect', () => {
                console.log(`Disconnected from ${relayUrl}`);
                connectedRelays--;
                updateRelayCount();
                updateStatus(`Connected to ${connectedRelays} relays`);
            });
            
            relay.on('error', (error) => {
                console.error(`Error with ${relayUrl}:`, error);
            });
            
            await relay.connect();
            relays.push(relay);
            
        } catch (error) {
            console.error(`Failed to connect to ${relayUrl}:`, error);
        }
    });
    
    await Promise.allSettled(connectionPromises);
}

// Subscribe to the target npub for kind 1 notes
async function subscribeToNpub() {
    if (relays.length === 0) {
        updateStatus('No relays connected');
        return;
    }
    
    updateStatus('Subscribing to notes...');
    
    // Convert npub to pubkey
    const pubkey = window.NostrTools.nip19.decode(TARGET_NPUB).data;
    
    // Create subscription filter
    const filter = {
        kinds: [1], // Kind 1 = text notes
        authors: [pubkey],
        limit: 50
    };
    
    // Subscribe to all connected relays
    relays.forEach(relay => {
        const sub = relay.sub([filter]);
        
        sub.on('event', (event) => {
            handleNoteEvent(event);
        });
        
        sub.on('eose', () => {
            console.log(`EOSE from ${relay.url}`);
        });
    });
}

// Handle incoming note events
function handleNoteEvent(event) {
    console.log('Received note:', event);
    
    // Only process kind 1 events
    if (event.kind !== 1) return;
    
    // Only process events with the specific structure
    if (!matchesTargetStructure(event)) {
        console.log('Skipping event - does not match target structure:', event.id);
        return;
    }
    
    // Store note if we haven't seen it before
    if (!notes.has(event.id)) {
        notes.set(event.id, event);
        totalNotes++;
        updateNoteCount();
        
        // Fetch user profile if not already cached
        fetchUserProfile(event.pubkey);
        
        displayNote(event);
        
        // Fetch and display the quoted note
        fetchQuotedNote(event);
    }
}

// Fetch user profile metadata
async function fetchUserProfile(pubkey) {
    // Skip if we already have this profile
    if (userProfiles.has(pubkey)) {
        return;
    }
    
    console.log('Fetching user profile:', pubkey);
    
    // Create filter to fetch user metadata (kind 0)
    const filter = {
        kinds: [0],
        authors: [pubkey],
        limit: 1
    };
    
    // Query all connected relays for the user profile
    relays.forEach(relay => {
        const sub = relay.sub([filter]);
        
        sub.on('event', (profileEvent) => {
            console.log('Received user profile:', profileEvent);
            
            try {
                const profile = JSON.parse(profileEvent.content);
                userProfiles.set(pubkey, profile);
                
                // Update any existing cards with this user
                updateUserDisplay(pubkey);
            } catch (error) {
                console.error('Error parsing user profile:', error);
                // Set a default profile
                userProfiles.set(pubkey, { name: 'Unknown User', picture: null });
            }
        });
        
        sub.on('eose', () => {
            console.log(`EOSE for user profile from ${relay.url}`);
        });
    });
}

// Update display for a specific user
function updateUserDisplay(pubkey) {
    const profile = userProfiles.get(pubkey);
    if (!profile) return;
    
    // Find all note cards with this author
    const authorElements = document.querySelectorAll(`[data-author="${pubkey}"]`);
    authorElements.forEach(element => {
        const username = profile.name || profile.display_name || 'Unknown User';
        const picture = profile.picture || null;
        
        // Update the author display
        const authorSpan = element.querySelector('.note-author');
        if (authorSpan) {
            authorSpan.innerHTML = `
                ${picture ? `<img src="${picture}" alt="Profile" class="author-pic" />` : ''}
                <span class="author-name">${escapeHtml(username)}</span>
            `;
        }
    });
}

// Fetch the quoted note referenced in the event
async function fetchQuotedNote(quotingEvent) {
    // Extract the quoted event ID from the event tag
    let quotedEventId = null;
    for (const tag of quotingEvent.tags) {
        if (Array.isArray(tag) && tag.length === 4 && tag[0] === 'e' && tag[3] === 'mention') {
            quotedEventId = tag[1];
            break;
        }
    }
    
    if (!quotedEventId) {
        console.log('No quoted event ID found');
        return;
    }
    
    console.log('Fetching quoted note:', quotedEventId);
    
    // Create filter to fetch the quoted event
    const filter = {
        kinds: [1],
        ids: [quotedEventId],
        limit: 1
    };
    
    // Query all connected relays for the quoted event
    relays.forEach(relay => {
        const sub = relay.sub([filter]);
        
        sub.on('event', (quotedEvent) => {
            console.log('Received quoted note:', quotedEvent);
            
            // Store quoted note if we haven't seen it before
            if (!notes.has(quotedEvent.id)) {
                notes.set(quotedEvent.id, quotedEvent);
                totalNotes++;
                updateNoteCount();
                displayQuotedNote(quotedEvent, quotingEvent);
                
                // Recursively fetch any quoted notes within this quoted note
                fetchQuotedNote(quotedEvent);
            }
        });
        
        sub.on('eose', () => {
            console.log(`EOSE for quoted note from ${relay.url}`);
        });
    });
}

// Check if an event matches the specific structure
function matchesTargetStructure(event) {
    // Check if event has tags
    if (!event.tags || !Array.isArray(event.tags)) {
        return false;
    }
    
    // Look for the specific event tag structure: ["e", eventId, relayUrl, "mention"]
    let hasCorrectEventTag = false;
    
    for (const tag of event.tags) {
        if (Array.isArray(tag) && tag.length === 4 && tag[0] === 'e' && tag[3] === 'mention') {
            // Check if the third element (index 2) is a relay URL
            if (tag[2] && typeof tag[2] === 'string' && tag[2].includes('relay.')) {
                hasCorrectEventTag = true;
                break;
            }
        }
    }
    
    return hasCorrectEventTag;
}

// Display a note in the feed
function displayNote(event) {
    // Remove loading message if it exists
    const loadingMessage = notesFeed.querySelector('.loading-message');
    if (loadingMessage) {
        loadingMessage.remove();
    }
    
    // Create note card
    const noteCard = document.createElement('div');
    noteCard.className = 'note-card';
    noteCard.dataset.eventId = event.id;
    noteCard.dataset.author = event.pubkey;
    
    // Format timestamp
    const timestamp = new Date(event.created_at * 1000);
    const timeString = timestamp.toLocaleString();
    
    // Clean content by removing nostr:nevent strings and truncate if too long
    let content = event.content.replace(/nostr:nevent[^\s]*/g, '').trim();
    content = content.length > 200 
        ? content.substring(0, 200) + '...' 
        : content;
    
    // Get user profile if available
    const profile = userProfiles.get(event.pubkey);
    const username = profile ? (profile.name || profile.display_name || 'Unknown User') : event.pubkey.substring(0, 8) + '...';
    const picture = profile ? profile.picture : null;
    
    noteCard.innerHTML = `
        <div class="note-header">
            <div class="note-author">
                <img src="https://api.dicebear.com/7.x/pixel-art/svg?seed=${event.pubkey}" alt="Avatar" class="author-pic">
                <span class="author-name">${escapeHtml(username)}</span>
            </div>
            <span class="note-time">${timeString}</span>
        </div>
        <div class="note-content">${escapeHtml(content)}</div>
        <div class="quoted-container" id="quoted-${event.id}"></div>
    `;
    
    // Add to feed (prepend to show newest first)
    notesFeed.insertBefore(noteCard, notesFeed.firstChild);
    
    // Limit displayed notes to prevent memory issues
    const noteCards = notesFeed.querySelectorAll('.note-card');
    if (noteCards.length > 100) {
        noteCards[noteCards.length - 1].remove();
    }
}

// Display a quoted note nested within the main event
function displayQuotedNote(quotedEvent, quotingEvent) {
    // Find the container for the quoting event
    const quotedContainer = document.getElementById(`quoted-${quotingEvent.id}`);
    
    if (!quotedContainer) {
        console.log('Quoted container not found for event:', quotingEvent.id);
        return;
    }
    
    // Create quoted note card
    const quotedCard = document.createElement('div');
    quotedCard.className = 'quoted-note';
    quotedCard.dataset.eventId = quotedEvent.id;
    quotedCard.dataset.author = quotedEvent.pubkey;
    
    // Format timestamp
    const timestamp = new Date(quotedEvent.created_at * 1000);
    const timeString = timestamp.toLocaleString();
    
    // Clean content by removing nostr:nevent strings and truncate if too long
    let content = quotedEvent.content.replace(/nostr:nevent[^\s]*/g, '').trim();
    content = content.length > 200 
        ? content.substring(0, 200) + '...' 
        : content;
    
    // Get user profile if available
    const profile = userProfiles.get(quotedEvent.pubkey);
    const username = profile ? (profile.name || profile.display_name || 'Unknown User') : quotedEvent.pubkey.substring(0, 8) + '...';
    const picture = profile ? profile.picture : null;
    
    quotedCard.innerHTML = `
        <div class="note-header">
            <div class="note-author">
                <img src="https://api.dicebear.com/7.x/pixel-art/svg?seed=${quotedEvent.pubkey}" alt="Avatar" class="author-pic">
                <span class="author-name">${escapeHtml(username)}</span>
            </div>
            <span class="note-time">${timeString}</span>
        </div>
        <div class="note-content quoted-content">${escapeHtml(content)}</div>
        <div class="quoted-container" id="quoted-${quotedEvent.id}"></div>
    `;
    
    // Add the quoted note to the container
    quotedContainer.appendChild(quotedCard);
    
    // Fetch user profile if not already cached
    fetchUserProfile(quotedEvent.pubkey);
}

// Utility function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Update status display
function updateStatus(status) {
    connectionStatus.textContent = status;
}

// Update relay count display
function updateRelayCount() {
    relayCount.textContent = connectedRelays;
}

// Update note count display
function updateNoteCount() {
    noteCount.textContent = totalNotes;
}

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('Page hidden, pausing updates');
    } else {
        console.log('Page visible, resuming updates');
    }
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    // Close all relay connections
    relays.forEach(relay => {
        if (relay.status === 1) { // Connected
            relay.close();
        }
    });
});

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init);

// Add some visual feedback for new notes
function addNoteAnimation(noteCard) {
    noteCard.style.animation = 'noteAppear 0.5s ease-out';
    setTimeout(() => {
        noteCard.style.animation = '';
    }, 500);
}

// Add CSS animation for new notes
const style = document.createElement('style');
style.textContent = `
    @keyframes noteAppear {
        from {
            opacity: 0;
            transform: translateY(-20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
`;
document.head.appendChild(style);
