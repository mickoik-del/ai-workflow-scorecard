export default async function handler(req, res) {
    // 1. Log the incoming request so we can see it in Vercel Logs
    console.log("Bridge Triggered. Payload received:", req.body);

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { email, industry, title, risk, assetName, message } = req.body;
    const hubspotToken = process.env.HUBSPOT_ACCESS_TOKEN;

    if (!hubspotToken) {
        console.error("CRITICAL: HubSpot Token is missing from Vercel Environment Variables!");
        return res.status(500).json({ error: "Server Configuration Error" });
    }

    try {
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

        const data = await response.json();

        if (!response.ok) {
            console.error("HubSpot API Error:", data);
            return res.status(response.status).json(data);
        }

        console.log("HubSpot Sync Success:", data);
        return res.status(200).json({ success: true });

    } catch (error) {
        console.error("Internal Bridge Error:", error.message);
        return res.status(500).json({ error: error.message });
    }
}
