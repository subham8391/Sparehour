import { googleSignInError, signInError } from "./sign-in-error";

describe("signInError", () => {
  it("speaks plainly about the two things that usually go wrong, and passes on anything else", () => {
    expect(signInError(undefined)).toBe("That didn't work. Try again.");
    expect(signInError("Network request failed")).toBe("Couldn't reach Sparehour. Check your connection and try again.");
    expect(signInError("Token has expired or is invalid")).toBe("That code didn't work. Check it, or ask for a new one.");
    expect(signInError("Signups not allowed for otp")).toBe("Signups not allowed for otp");
  });
});

describe("googleSignInError", () => {
  it("says the same about the network, and otherwise the auth server's own reason: there is no code to blame", () => {
    expect(googleSignInError(undefined)).toBe("That didn't work. Try again.");
    expect(googleSignInError("Network request failed")).toBe("Couldn't reach Sparehour. Check your connection and try again.");
    expect(googleSignInError("invalid flow state, no valid flow state found")).toBe("invalid flow state, no valid flow state found");
  });
});
