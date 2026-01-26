export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { email, industry, title, risk, assetName, message } = req.body;
    const hubspotToken = process.env.HUBSPOT_ACCESS_TOKEN;

    try {
        // This "upsert" call creates the contact if new, or updates if they exist
        const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/upsert', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${hubspotToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                idProperty: 'email',
                idValue: email,
                properties: {
                    email: email,
                    industry: industry,
                    jobtitle: title,
                    lifecyclestage: 'subscriber', 
                    scorecard_risk_level: risk,   
                    scorecard_message: message,    
                    scorecard_asset: assetName     
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            return res.status(response.status).json(errorData);
        }

        return res.status(200).json({ success: true });
    } catch (error) {
        return res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}
