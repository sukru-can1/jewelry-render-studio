export async function submitRunPod(input: Record<string, unknown>) {
  const apiKey = process.env.RUNPOD_API_KEY;
  const endpointId = process.env.RUNPOD_ENDPOINT_ID;
  if (!apiKey) throw new Error("RUNPOD_API_KEY is not configured.");
  if (!endpointId) throw new Error("RUNPOD_ENDPOINT_ID is not configured.");

  const response = await fetch(`https://api.runpod.ai/v2/${endpointId}/run`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ input })
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function getRunPodStatus(runpodJobId: string) {
  const apiKey = process.env.RUNPOD_API_KEY;
  const endpointId = process.env.RUNPOD_ENDPOINT_ID;
  if (!apiKey) throw new Error("RUNPOD_API_KEY is not configured.");
  if (!endpointId) throw new Error("RUNPOD_ENDPOINT_ID is not configured.");

  const response = await fetch(`https://api.runpod.ai/v2/${endpointId}/status/${runpodJobId}`, {
    headers: {
      authorization: `Bearer ${apiKey}`
    },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

