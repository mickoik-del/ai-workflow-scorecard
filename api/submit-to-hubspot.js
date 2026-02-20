// Simple in-memory rate limiter
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS_PER_WINDOW = 10;

function checkRateLimit(identifier) {
    const now = Date.now();
    const userRequests = rateLimitMap.get(identifier) || [];
    
    // Remove old requests outside the time window
    const recentRequests = userRequests.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
    
    if (recentRequests.length >= MAX_REQUESTS_PER_WINDOW) {
        return false; // Rate limit exceeded
    }
    
    // Add current request
    recentRequests.push(now);
    rateLimitMap.set(identifier, recentRequests);
    
    return true; // Within rate limit
}

function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return false;
    
    // Block personal domains
    const personalDomains = [
        'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
        'icloud.com', 'me.com', 'aol.com', 'msn.com', 'live.com'
    ];
    
    const domain = email.split('@')[1].toLowerCase();
    return !personalDomains.includes(domain);
}

export default async function (req, res) {
    // CORS - Only allow requests from your domains
    const origin = req.headers.origin || req.headers.referer || '';
    
    const allowedDomains = [
        'callvu.com',
        'vercel.app'
    ];
    
    const isAllowed = allowedDomains.some(domain => origin.includes(domain)) || 
                      origin.includes('localhost'); // For local testing
    
    if (origin && !isAllowed) {
        console.error('[SECURITY] Blocked request from unauthorized origin:', origin);
        return res.status(403).json({ error: "UNAUTHORIZED_ORIGIN" });
    }
    
    // Only accept POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    }
    
    try {
        const hubspotToken = process.env.HUBSPOT_ACCESS_TOKEN;
        
        // Check if token exists
        if (!hubspotToken) {
            console.error('[CONFIG] HubSpot token missing in environment variables');
            return res.status(500).json({ error: "TOKEN_MISSING_IN_VERCEL" });
        }
        
        const body = req.body;
        
        // Input validation
        if (!body || typeof body !== 'object') {
            console.error('[VALIDATION] Invalid request body');
            return res.status(400).json({ error: "INVALID_REQUEST_BODY" });
        }
        
        const { email, industry, title, risk, assetName, message } = body;
        
        // Validate email
        if (!email || !validateEmail(email)) {
            console.error('[VALIDATION] Invalid email:', email);
            return res.status(400).json({ error: "INVALID_EMAIL" });
        }
        
        // Validate industry
        const validIndustries = ['BANKING', 'INSURANCE', 'TELCO', 'UTILITIES', 'HEALTHCARE', 'MORTGAGE', 'TRAVEL', 'OTHER'];
        if (!industry || !validIndustries.includes(industry)) {
            console.error('[VALIDATION] Invalid industry:', industry);
            return res.status(400).json({ error: "INVALID_INDUSTRY" });
        }
        
        // Validate risk level
        const validRisks = ['LOW', 'COMPLETION', 'HIGH'];
        if (!risk || !validRisks.includes(risk)) {
            console.error('[VALIDATION] Invalid risk level:', risk);
            return res.status(400).json({ error: "INVALID_RISK_LEVEL" });
        }
        
        // Validate title length
        if (!title || title.length > 100) {
            console.error('[VALIDATION] Invalid title length');
            return res.status(400).json({ error: "INVALID_TITLE" });
        }
        
        // Validate message length
        if (!message || message.length > 2000) {
            console.error('[VALIDATION] Invalid message length');
            return res.status(400).json({ error: "INVALID_MESSAGE" });
        }
        
        // Rate limiting (by email)
        if (!checkRateLimit(email)) {
            console.warn('[RATE_LIMIT] Too many requests from:', email);
            return res.status(429).json({ 
                error: "RATE_LIMIT_EXCEEDED",
                message: "Too many submissions. Please try again in an hour."
            });
        }
        
        console.log('[INFO] Processing submission for:', email, 'Risk:', risk);
        
        // Determine lifecycle stage - use display labels, not internal values
        let lifecycleStage = 'Marketing Qualified Lead'; // Default for LOW
        if (risk === 'HIGH' || risk === 'COMPLETION') {
            lifecycleStage = 'Sales Qualified Lead';
        }
        
        console.log('[INFO] Lifecycle stage:', lifecycleStage);
        
        // Search for existing contact
        console.log('[HUBSPOT] Searching for existing contact...');
        const searchResponse = await fetch(
            'https://api.hubapi.com/crm/v3/objects/contacts/search',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${hubspotToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filterGroups: [{
                        filters: [{
                            propertyName: 'email',
                            operator: 'EQ',
                            value: email
                        }]
                    }]
                })
            }
        );
        
        if (!searchResponse.ok) {
            const searchError = await searchResponse.json();
            console.error('[HUBSPOT] Search failed:', searchError);
            return res.status(searchResponse.status).json({ 
                error: "HUBSPOT_SEARCH_FAILED", 
                details: searchError 
            });
        }
        
        const searchResult = await searchResponse.json();
        console.log('[HUBSPOT] Search result:', searchResult.results?.length || 0, 'contacts found');
        
        // Prepare properties
        const properties = {
            email: email,
            industry: industry,
            jobtitle: title,
            scorecard_risk_level: risk,
            scorecard_asset: assetName,
            scorecard_message: message,
            lifecycle_stage__new_: lifecycleStage
        };
        
        console.log('[HUBSPOT] Properties to send:', JSON.stringify(properties, null, 2));
        
        // If contact exists, UPDATE
        if (searchResult.results && searchResult.results.length > 0) {
            const contactId = searchResult.results[0].id;
            console.log('[HUBSPOT] Updating existing contact:', contactId);
            
            const updateResponse = await fetch(
                `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`,
                {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${hubspotToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ properties })
                }
            );
            
            const updateResult = await updateResponse.json();
            
            if (!updateResponse.ok) {
                console.error('[HUBSPOT] Update failed:', updateResult);
                return res.status(updateResponse.status).json({ 
                    error: "HUBSPOT_UPDATE_FAILED", 
                    details: updateResult 
                });
            }
            
            console.log('[HUBSPOT] Successfully updated contact:', contactId);
            return res.status(200).json({ 
                success: true, 
                action: 'updated',
                contactId: contactId,
                debug: {
                    email,
                    risk,
                    lifecycleStage,
                    propertiesSent: properties
                }
            });
        }
        
        // If contact doesn't exist, CREATE
        console.log('[HUBSPOT] Creating new contact...');
        const createResponse = await fetch(
            'https://api.hubapi.com/crm/v3/objects/contacts',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${hubspotToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ properties })
            }
        );
        
        const createResult = await createResponse.json();
        
        if (!createResponse.ok) {
            console.error('[HUBSPOT] Create failed:', createResult);
            return res.status(createResponse.status).json({ 
                error: "HUBSPOT_CREATE_FAILED", 
                details: createResult 
            });
        }
        
        console.log('[HUBSPOT] Successfully created contact:', createResult.id);
        return res.status(200).json({ 
            success: true, 
            action: 'created',
            contactId: createResult.id,
            debug: {
                email,
                risk,
                lifecycleStage,
                propertiesSent: properties
            }
        });
        
    } catch (err) {
        console.error('[ERROR] Unexpected error:', err);
        return res.status(500).json({ 
            error: "BRIDGE_CRASHED", 
            message: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
}
