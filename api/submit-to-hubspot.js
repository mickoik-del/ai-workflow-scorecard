export default async function (req, res) {
    try {
        const hubspotToken = process.env.HUBSPOT_ACCESS_TOKEN;
        
        // 1. Check if the token even exists
        if (!hubspotToken) {
            return res.status(500).json({ error: "TOKEN_MISSING_IN_VERCEL" });
        }

        const body = req.body;
        
        // 2. Attempt the HubSpot call
        const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${hubspotToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                properties: {
                    email: body.email,
                    industry: body.industry,
                    jobtitle: body.title,
                    scorecard_risk_level: body.risk,
                    scorecard_message: body.message,
                    scorecard_asset: body.assetName
                }
            })
        });

        const result = await response.json();

        // 3. If HubSpot says no, send the WHOLE HubSpot error back to the browser
        if (!response.ok) {
            return res.status(response.status).json({ 
                error: "HUBSPOT_REJECTION", 
                details: result 
            });
        }

        return res.status(200).json({ success: true });

    } catch (err) {
        // 4. If the code itself crashed, send the crash report back to the browser
        return res.status(500).json({ 
            error: "BRIDGE_CRASHED", 
            message: err.message 
        });
    }
}
