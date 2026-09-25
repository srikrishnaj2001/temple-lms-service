export async function getStreamUrl(externalVideoId: string) {
  if (!process.env.GUMLET_API_KEY) {
    return {
      streamUrl: `https://play.gumlet.io/embed/${externalVideoId}`,
      provider: "gumlet",
      mode: "demo"
    };
  }

  return {
    streamUrl: `https://play.gumlet.io/embed/${externalVideoId}`,
    provider: "gumlet",
    mode: "api-ready"
  };
}
