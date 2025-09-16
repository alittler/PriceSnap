// This is a Vercel serverless function.
// It must be placed in the `api` directory of your project.

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Retrieve the secret API key from environment variables
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error("API key is not configured.");
        }

        const { images } = request.body;
        if (!images || !Array.isArray(images) || images.length === 0) {
            return response.status(400).json({ error: 'No images provided.' });
        }

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
        
        const systemPrompt = `You are an expert AI assistant specializing in comparing grocery prices from multiple images. For each image, identify the item, extract its price, and apply any visible discounts. First, present each item's details individually. Second, determine several logical common units (e.g., per lb, per oz, per kg, per 100g). Third, create an array of summary cards, one for each common unit, comparing all items by that unit with prices sorted from lowest to highest. Respond ONLY with the specified JSON object.`;
        const userPrompt = `Analyze these ${images.length} images. Provide a summary of your findings in the requested JSON format.`;

        const imageParts = images.map(img => ({
            inlineData: { mimeType: img.mimeType, data: img.data }
        }));
        
        const payload = {
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: userPrompt }, ...imageParts] }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        comparison_summary: { type: "STRING" },
                        reasoning: { type: "STRING" },
                        items: {
                            type: "ARRAY",
                            items: {
                                type: "OBJECT",
                                properties: {
                                    name: { type: "STRING" },
                                    description: { type: "STRING" },
                                    price: { type: "STRING" },
                                    rank: { type: "NUMBER" }
                                },
                                required: ["name", "description", "price", "rank"]
                            }
                        },
                        unit_comparisons: {
                            type: "ARRAY",
                            items: {
                                type: "OBJECT",
                                properties: {
                                    title: { type: "STRING" },
                                    items: {
                                        type: "ARRAY",
                                        items: {
                                            type: "OBJECT",
                                            properties: {
                                                name: { type: "STRING" },
                                                unit_price: { type: "STRING" }
                                            },
                                            required: ["name", "unit_price"]
                                        }
                                    }
                                },
                                required: ["title", "items"]
                            }
                        }
                    },
                    required: ["comparison_summary", "reasoning", "items", "unit_comparisons"]
                }
            }
        };

        const geminiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!geminiResponse.ok) {
            console.error("Gemini API Error:", await geminiResponse.text());
            throw new Error(`Gemini API call failed with status: ${geminiResponse.status}`);
        }

        const result = await geminiResponse.json();
        const candidate = result.candidates?.[0];

        if (candidate && candidate.content?.parts?.[0]?.text) {
            const jsonResponse = JSON.parse(candidate.content.parts[0].text);
            return response.status(200).json(jsonResponse);
        } else {
            throw new Error("Invalid response structure from Gemini API.");
        }

    } catch (error) {
        console.error("Serverless function error:", error);
        return response.status(500).json({ error: 'An internal server error occurred.' });
    }
}
