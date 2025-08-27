// Nostr configuration
const TARGET_NPUB = 'npub1t83prys2hepmqmln9adygpg8z5fq2lse5v6grjhecagr09rya4qs78wxhz';
const RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.primal.net/'
];

// Configuration constants
const CONFIG = {
    MAX_DISPLAYED_NOTES: 100,
    CONTENT_TRUNCATE_LENGTH: 200,
    RELAY_CONNECT_TIMEOUT: 10000, // 10 seconds
    MAX_RETRY_ATTEMPTS: 3
};

// Global variables
let connectedRelays = 0;
let totalNotes = 0;
let notes = new Map(); // Use Map to store unique notes by ID
let repostTimes = new Map(); // Store repost times by quoted event ID
let relays = [];
let userProfiles = new Map(); // Store user profiles for usernames and pictures
let subscribedRelays = new Set(); // Track which relays we've already subscribed to
let isInitialized = false;

// DOM elements
const connectionStatus = document.getElementById('connection-status');
const relayCount = document.getElementById('relay-count');
const noteCount = document.getElementById('note-count');
const notesFeed = document.getElementById('notes-feed');

// Utility functions
const utils = {
    // Sanitize HTML content to prevent XSS
    sanitizeHtml: (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // Escape HTML for safe insertion
    escapeHtml: (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // Debounce function to limit rapid calls
    debounce: (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Format timestamp consistently
    formatTimestamp: (timestamp) => {
        return new Date(timestamp * 1000).toLocaleString();
    },

    // Generate avatar URL with fallback
    getAvatarUrl: (pubkey) => {
        return `https://api.dicebear.com/7.x/pixel-art/svg?seed=${pubkey}`;
    }
};

// Relay management
const relayManager = {
    async connectToRelays() {
    let firstRelayConnected = false;
    const connectionPromises = RELAYS.map(async (relayUrl) => {
        try {
            const relay = window.NostrTools.relayInit(relayUrl);
                
                // Add timeout for connection
                const connectionTimeout = setTimeout(() => {
                    console.warn(`Connection timeout for ${relayUrl}`);
                    relay.close();
                }, CONFIG.RELAY_CONNECT_TIMEOUT);
            
            relay.on('connect', () => {
                    clearTimeout(connectionTimeout);
                console.log(`Connected to ${relayUrl}`);
                connectedRelays++;
                    uiManager.updateRelayCount();
                    uiManager.updateStatus(`Connected to ${connectedRelays} relays`);
                
                // If this is the first relay to connect, start subscribing immediately
                if (!firstRelayConnected) {
                    firstRelayConnected = true;
                    console.log('First relay connected, starting subscription...');
                        this.subscribeToNpub();
                } else {
                    // For additional relays, subscribe to them as well
                    console.log('Additional relay connected, subscribing to it...');
                        this.subscribeToNpub();
                }
            });
            
            relay.on('disconnect', () => {
                console.log(`Disconnected from ${relayUrl}`);
                connectedRelays--;
                    uiManager.updateRelayCount();
                    uiManager.updateStatus(`Connected to ${connectedRelays} relays`);
            });
            
            relay.on('error', (error) => {
                console.error(`Error with ${relayUrl}:`, error);
                    // Consider implementing retry logic here
            });
            
            await relay.connect();
            relays.push(relay);
            
        } catch (error) {
            console.error(`Failed to connect to ${relayUrl}:`, error);
        }
    });
    
    // Don't wait for all relays - let them connect in the background
    connectionPromises.forEach(promise => {
        promise.catch(error => {
            console.error('Relay connection failed:', error);
        });
    });
    },

    async subscribeToNpub() {
    if (relays.length === 0) {
            uiManager.updateStatus('No relays connected');
        return;
    }
    
        uiManager.updateStatus('Subscribing to notes...');
    
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
        // Check if we're already subscribed to this relay
        if (subscribedRelays.has(relay.url)) {
            console.log(`Already subscribed to ${relay.url}, skipping duplicate subscription`);
            return;
        }
        
        const sub = relay.sub([filter]);
        subscribedRelays.add(relay.url);
        
        sub.on('event', (event) => {
                eventProcessor.handleNoteEvent(event);
        });
        
        sub.on('eose', () => {
            console.log(`EOSE from ${relay.url}`);
        });
    });
}
};

// Event processing
const eventProcessor = {
    handleNoteEvent(event) {
    console.log('Received note:', event);
    
    // Only process kind 1 events
    if (event.kind !== 1) return;
    
    // Only process mention events (not reply events)
        if (!this.matchesTargetStructure(event)) {
        console.log('Skipping event - not a mention event:', event.id);
        return;
    }
    
    // Store note if we haven't seen it before
    if (!notes.has(event.id)) {
        notes.set(event.id, event);
        totalNotes++;
            uiManager.updateNoteCount();
        

        
        // Fetch user profile if not already cached
            profileManager.fetchUserProfile(event.pubkey);
        
            uiManager.displayNote(event);
        
        // Fetch and display the quoted note
            this.fetchQuotedNote(event);
    } else {
        console.log('Event already exists, but checking for quoted notes:', event.id);
        // Even if the event exists, try to fetch quoted notes
            this.fetchQuotedNote(event);
        }
    },

    matchesTargetStructure(event) {
        // Check if event has tags
        if (!event.tags || !Array.isArray(event.tags)) {
            return false;
        }
        
        // Look for event tags that are mentions (have "mention" as the 4th element)
        let hasMentionTag = false;
        
        for (const tag of event.tags) {
            if (Array.isArray(tag) && tag.length >= 4 && tag[0] === 'e' && tag[3] === 'mention') {
                hasMentionTag = true;
                break;
            }
        }
        
        return hasMentionTag;
    },

    extractQuotedEventId(event) {
        if (!event.tags || !Array.isArray(event.tags)) {
            return null;
        }
        
        for (const tag of event.tags) {
            if (Array.isArray(tag) && tag.length >= 4 && tag[0] === 'e' && tag[3] === 'mention') {
                return tag[1];
            }
        }
        
        return null;
    },

    async fetchQuotedNote(quotingEvent) {
    // Extract the quoted event ID from the mention event tag
    let quotedEventId = null;
    for (const tag of quotingEvent.tags) {
        if (Array.isArray(tag) && tag.length >= 4 && tag[0] === 'e' && tag[3] === 'mention') {
            quotedEventId = tag[1];
            break;
        }
    }
    
    if (!quotedEventId) {
        console.log('No quoted event ID found in mention tags');
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
                    uiManager.updateNoteCount();
                    uiManager.displayQuotedNote(quotedEvent, quotingEvent);
                
                // Recursively fetch any quoted notes within this quoted note
                    this.fetchQuotedNote(quotedEvent);
            }
        });
        
        sub.on('eose', () => {
            console.log(`EOSE for quoted note from ${relay.url}`);
        });
    });
    },

    async fetchNestedEvent(neventRef, parentEventId) {
    try {
        // Validate nevent format before attempting to decode
        if (!neventRef || typeof neventRef !== 'string' || !neventRef.startsWith('nostr:nevent')) {
            console.log('Invalid nevent format:', neventRef);
            return;
        }
        
        // Additional validation for nevent format
        const neventPart = neventRef.replace('nostr:nevent', '');
        if (!neventPart || neventPart.length < 10) {
            console.log('Nevent too short:', neventRef);
            return;
        }
        
        // Try to decode the nevent reference
        let decoded;
        try {
            decoded = window.NostrTools.nip19.decode(neventRef);
        } catch (decodeError) {
            console.log('Failed to decode nevent (invalid checksum or malformed):', neventRef);
            console.log('Decode error:', decodeError.message);
            // Don't throw the error, just return gracefully
            return;
        }
        
        if (!decoded || !decoded.data || !decoded.data.id) {
            console.log('Invalid nevent reference structure:', neventRef);
            return;
        }
        
        const eventId = decoded.data.id;
        console.log('Fetching nested event from nevent:', eventId, 'for parent:', parentEventId);
        
        // Check if this event is already being fetched by fetchQuotedNote
        // If the parent event has an event tag with this ID, skip fetching here
        const parentEvent = notes.get(parentEventId);
        if (parentEvent) {
            for (const tag of parentEvent.tags) {
                if (Array.isArray(tag) && tag.length >= 2 && tag[0] === 'e' && tag[1] === eventId) {
                    console.log('Event already being fetched by fetchQuotedNote, skipping duplicate fetch');
                    return;
                }
            }
        }
        
        // Create filter to fetch the nested event
        const filter = {
            kinds: [1],
            ids: [eventId],
            limit: 1
        };
        
        // Query all connected relays for the nested event
        relays.forEach(relay => {
            const sub = relay.sub([filter]);
            
            sub.on('event', (nestedEvent) => {
                console.log('Received nested event from nevent:', nestedEvent);
                
                // Store nested event if we haven't seen it before
                if (!notes.has(nestedEvent.id)) {
                    notes.set(nestedEvent.id, nestedEvent);
                    totalNotes++;
                        uiManager.updateNoteCount();
                    
                    // Display the nested event
                        uiManager.displayNestedEvent(nestedEvent, parentEventId);
                    
                    // Fetch user profile if not already cached
                        profileManager.fetchUserProfile(nestedEvent.pubkey);
                } else {
                    console.log('Nested event already exists, displaying as nested');
                    // Even if the event exists, display it as nested if it's from nevent
                        uiManager.displayNestedEvent(nestedEvent, parentEventId);
                }
            });
            
            sub.on('eose', () => {
                console.log(`EOSE for nested event from ${relay.url}`);
            });
        });
        
    } catch (error) {
        console.error('Unexpected error in fetchNestedEvent:', error);
        console.log('Problematic nevent reference:', neventRef);
        // Continue processing other nevent references instead of crashing
        return;
    }
}
};

// Profile management
const profileManager = {
    async fetchUserProfile(pubkey) {
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
                    this.updateUserDisplay(pubkey);
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
    },

    updateUserDisplay(pubkey) {
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
                    ${picture ? `<img src="${utils.sanitizeHtml(picture)}" alt="Profile" class="author-pic" />` : ''}
                    <span class="author-name">${utils.escapeHtml(username)}</span>
                `;
            }
        });
    }
};

// UI management
const uiManager = {
    updateStatus(status) {
        connectionStatus.textContent = status;
    },

    updateRelayCount() {
        relayCount.textContent = connectedRelays;
    },

    updateNoteCount() {
        noteCount.textContent = totalNotes;
    },

    displayNote(event) {
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
        const timeString = utils.formatTimestamp(event.created_at);
        
        // Parse content and extract nostr:nevent references
        const { cleanContent, neventRefs } = this.parseContentForNevents(event.content);
        
        // Truncate content if too long (check original text length, not HTML)
        let content = cleanContent.length > CONFIG.CONTENT_TRUNCATE_LENGTH 
            ? this.processEmojis(cleanContent.substring(0, CONFIG.CONTENT_TRUNCATE_LENGTH)) + '...' 
            : this.processEmojis(cleanContent);
        
        // Get user profile if available
        const profile = userProfiles.get(event.pubkey);
        const username = profile ? (profile.name || profile.display_name || 'Unknown User') : event.pubkey.substring(0, 8) + '...';
        
        noteCard.innerHTML = `
            <div class="note-header">
                <div class="note-author">
                    <img src="${utils.getAvatarUrl(event.pubkey)}" alt="Avatar" class="author-pic">
                    <span class="author-name">${utils.escapeHtml(username)}</span>
                </div>
                <span class="note-time">${timeString}</span>
            </div>
            <div class="note-content">${content}</div>
            <div class="quoted-container" id="quoted-${event.id}"></div>
        `;
        
        // Add to feed (no sorting)
        notesFeed.appendChild(noteCard);
        
        // Fetch nested events from nevent references
        neventRefs.forEach(neventRef => {
            eventProcessor.fetchNestedEvent(neventRef, event.id);
        });
        
        // Limit displayed notes to prevent memory issues
        this.limitDisplayedNotes();
    },



    limitDisplayedNotes() {
        const noteCards = notesFeed.querySelectorAll('.note-card');
        if (noteCards.length > CONFIG.MAX_DISPLAYED_NOTES) {
            noteCards[noteCards.length - 1].remove();
        }
    },

    displayQuotedNote(quotedEvent, quotingEvent) {
        console.log('Displaying quoted note:', quotedEvent.id, 'for quoting event:', quotingEvent.id);
        
        // Find the container for the quoting event
        const quotedContainer = document.getElementById(`quoted-${quotingEvent.id}`);
        
        if (!quotedContainer) {
            console.log('Quoted container not found for event:', quotingEvent.id);
            console.log('Available containers:', document.querySelectorAll('.quoted-container').length);
            return;
        }
        
        // Create quoted note card
        const quotedCard = document.createElement('div');
        quotedCard.className = 'quoted-note';
        quotedCard.dataset.eventId = quotedEvent.id;
        quotedCard.dataset.author = quotedEvent.pubkey;
        
        // Format timestamp
        const timeString = utils.formatTimestamp(quotedEvent.created_at);
        
        // Parse content and extract nostr:nevent references
        const { cleanContent, neventRefs } = this.parseContentForNevents(quotedEvent.content);
        
        // Truncate content if too long (check original text length, not HTML)
        let content = cleanContent.length > CONFIG.CONTENT_TRUNCATE_LENGTH 
            ? this.processEmojis(cleanContent.substring(0, CONFIG.CONTENT_TRUNCATE_LENGTH)) + '...' 
            : this.processEmojis(cleanContent);
        
        // Get user profile if available
        const profile = userProfiles.get(quotedEvent.pubkey);
        const username = profile ? (profile.name || profile.display_name || 'Unknown User') : quotedEvent.pubkey.substring(0, 8) + '...';
        
        quotedCard.innerHTML = `
            <div class="note-header">
                <div class="note-author">
                    <img src="${utils.getAvatarUrl(quotedEvent.pubkey)}" alt="Avatar" class="author-pic">
                    <span class="author-name">${utils.escapeHtml(username)}</span>
                </div>
                <span class="note-time">${timeString}</span>
            </div>
            <div class="note-content quoted-content">${content}</div>
            <div class="quoted-container" id="quoted-${quotedEvent.id}"></div>
        `;
        
        // Add the quoted note to the container
        quotedContainer.appendChild(quotedCard);
        
        // Fetch nested events from nevent references
        neventRefs.forEach(neventRef => {
            eventProcessor.fetchNestedEvent(neventRef, quotedEvent.id);
        });
        
        // Fetch user profile if not already cached
        profileManager.fetchUserProfile(quotedEvent.pubkey);
    },

    displayNestedEvent(nestedEvent, parentEventId) {
    // Find the container for the parent event
    const nestedContainer = document.getElementById(`quoted-${parentEventId}`);
    
    if (!nestedContainer) {
        console.log('Nested container not found for event:', parentEventId);
        return;
    }
    
    // Create nested note card
    const nestedCard = document.createElement('div');
    nestedCard.className = 'nested-note';
    nestedCard.dataset.eventId = nestedEvent.id;
    nestedCard.dataset.author = nestedEvent.pubkey;
    
    // Format timestamp
        const timeString = utils.formatTimestamp(nestedEvent.created_at);
    
    // Parse content and extract nostr:nevent references
        const { cleanContent, neventRefs } = this.parseContentForNevents(nestedEvent.content);
    
    // Truncate content if too long (check original text length, not HTML)
        let displayContent = cleanContent.length > CONFIG.CONTENT_TRUNCATE_LENGTH 
            ? this.processEmojis(cleanContent.substring(0, CONFIG.CONTENT_TRUNCATE_LENGTH)) + '...' 
            : this.processEmojis(cleanContent);
    
    // Get user profile if available
    const profile = userProfiles.get(nestedEvent.pubkey);
    const username = profile ? (profile.name || profile.display_name || 'Unknown User') : nestedEvent.pubkey.substring(0, 8) + '...';
    
    nestedCard.innerHTML = `
        <div class="note-header">
            <div class="note-author">
                    <img src="${utils.getAvatarUrl(nestedEvent.pubkey)}" alt="Avatar" class="author-pic">
                    <span class="author-name">${utils.escapeHtml(username)}</span>
            </div>
            <span class="note-time">${timeString}</span>
        </div>
        <div class="note-content nested-content">${displayContent}</div>
        <div class="quoted-container" id="quoted-${nestedEvent.id}"></div>
    `;
    
    // Add the nested note to the container
    nestedContainer.appendChild(nestedCard);
    
    // Fetch nested events from nevent references (recursive)
    neventRefs.forEach(neventRef => {
            eventProcessor.fetchNestedEvent(neventRef, nestedEvent.id);
        });
    },

    parseContentForNevents(content) {
        const neventRegex = /nostr:nevent[^\s]*/g;
        const neventRefs = [];
        let cleanContent = content;
        
        // Find all nevent references
        const matches = content.match(neventRegex);
        if (matches) {
            console.log('Found nevent references:', matches);
            matches.forEach(match => {
                // More thorough validation of nevent format before adding
                if (match && match.length > 20) { // Minimum reasonable length for nevent
                    // Check if it looks like a valid nevent format
                    const neventPart = match.replace('nostr:nevent', '');
                    if (neventPart && neventPart.length >= 10 && /^[a-zA-Z0-9]+$/.test(neventPart)) {
                        // Try to decode the nevent to validate it before adding
                        try {
                            window.NostrTools.nip19.decode(match);
                            neventRefs.push(match);
                            // Remove the nevent reference from clean content
                            cleanContent = cleanContent.replace(match, '').trim();
                        } catch (decodeError) {
                            console.log('Skipping nevent with invalid checksum:', match);
                            console.log('Decode error:', decodeError.message);
                            // Remove the invalid nevent reference from content anyway
                            cleanContent = cleanContent.replace(match, '').trim();
                        }
                    } else {
                        console.log('Skipping invalid nevent format:', match);
                        // Remove the invalid nevent reference from content
                        cleanContent = cleanContent.replace(match, '').trim();
                    }
                } else {
                    console.log('Skipping malformed nevent reference:', match);
                    // Remove the malformed nevent reference from content
                    cleanContent = cleanContent.replace(match, '').trim();
                }
            });
        }
        
        console.log('Parsed content - cleanContent:', cleanContent, 'neventRefs:', neventRefs);
        return { cleanContent, neventRefs };
    },

    processEmojis(text) {
        // Unicode emoji regex pattern (covers most emojis)
        const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20FF}]|[\u{FE00}-\u{FE0F}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{1F100}-\u{1F64F}]|[\u{1F910}-\u{1F96B}]|[\u{1F980}-\u{1F9E0}]/gu;
        
        return text.replace(emojiRegex, (match) => {
            // Check if it's a fire emoji for special treatment
            if (match === '🔥') {
                return `<span class="emoji emoji-large">${match}</span>`;
            }
            // Check for other special emojis that might need emphasis
            const specialEmojis = ['💥', '⚡', '🎯', '🏆', '⭐', '💯', '🚀'];
            if (specialEmojis.includes(match)) {
                return `<span class="emoji emoji-large">${match}</span>`;
            }
            // Regular emoji styling
            return `<span class="emoji">${match}</span>`;
        });
    }
};

// Initialize the application
async function init() {
    if (isInitialized) return;
    
    console.log('Initializing Banger Bot Live...');
    uiManager.updateStatus('Connecting to relays...');
    
    // Connect to relays (subscription will start automatically when first relay connects)
    await relayManager.connectToRelays();
    
    isInitialized = true;
}

// Event listeners
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('Page hidden, pausing updates');
    } else {
        console.log('Page visible, resuming updates');
    }
});

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
