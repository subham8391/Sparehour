import { missingConfig } from "./config";

describe("missingConfig", () => {
  const full = { appUrl: "https://app.test", powersyncUrl: "https://sync.test", supabaseUrl: "https://db.test", supabaseAnonKey: "anon" };

  it("is empty when every value is set", () => {
    expect(missingConfig(full)).toEqual([]);
  });

  it("names each missing value by the variable to set", () => {
    expect(missingConfig({ ...full, appUrl: "", supabaseAnonKey: "" })).toEqual(["EXPO_PUBLIC_APP_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY"]);
  });
});
