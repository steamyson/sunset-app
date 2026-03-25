const appJson = require("./app.json");

export default () => {
  const expoConfig = appJson.expo ?? {};
  const android = expoConfig.android ?? {};
  const androidConfig = android.config ?? {};

  return {
    ...expoConfig,
    android: {
      ...android,
      config: {
        ...androidConfig,
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
        },
      },
    },
  };
};
