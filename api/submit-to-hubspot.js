export default async function (req, res) {
    try {
        const hubspotToken = process.env.HUBSPOT_ACCESS_TOKEN;
        
        // 1. Check if the token exists
        if (!hubspotToken) {
            return res.status(500).json({ error: "TOKEN_MISSING_IN_VERCEL" });
        }
        
        const body = req.body;
        const email = body.email;
        
        // Determine lifecycle stage based on risk level
        let lifecycleStage = 'marketingqualifiedlead'; // Default for LOW
        if (body.risk === 'HIGH' || body.risk === 'COMPLETION') {
            lifecycleStage = 'salesqualifiedlead';
        }
        
        // 2. Search for existing contact by email
        const searchResponse = await fetch(
            `https://api.hubapi.com/crm/v3/objects/contacts/search`,
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
        
        const searchResult = await searchResponse.json();
        
        // Prepare properties
        const properties = {
            email: email,
            industry: body.industry,
            jobtitle: body.title,
            scorecard_risk_level: body.risk,
            scorecard_asset: body.assetName,
            scorecard_message: body.message,
            lifecyclestage: lifecycleStage
        };
        
        // 3. If contact exists, UPDATE it
        if (searchResult.results && searchResult.results.length > 0) {
            const contactId = searchResult.results[0].id;
            
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
                return res.status(updateResponse.status).json({ 
                    error: "HUBSPOT_UPDATE_FAILED", 
                    details: updateResult 
                });
            }
            
            return res.status(200).json({ 
                success: true, 
                action: 'updated',
                contactId: contactId 
            });
        }
        
        // 4. If contact doesn't exist, CREATE it
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
            return res.status(createResponse.status).json({ 
                error: "HUBSPOT_CREATE_FAILED", 
                details: createResult 
            });
        }
        
        return res.status(200).json({ 
            success: true, 
            action: 'created',
            contactId: createResult.id 
        });
        
    } catch (err) {
        return res.status(500).json({ 
            error: "BRIDGE_CRASHED", 
            message: err.message 
        });
    }
}
