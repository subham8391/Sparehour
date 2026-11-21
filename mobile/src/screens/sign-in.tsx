// Sign-in on the phone (ANDROID_APP_SPEC.md §6, ONBOARDING.md step 1): the emailed six-digit code, the same account
// as on the web. Google sign-in is its own step of the plan (§10, step 3); the code works for every account meanwhile.
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { signInError } from "~/auth/sign-in-error";
import { supabase } from "~/auth/supabase";
import { TARGET, font, useColours } from "~/ui/theme";

export function SignIn() {
  const c = useColours();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const to = email.trim();
    if (!to || busy) return;
    setBusy(true);
    setError(null);
    const { error: failed } = await supabase().auth.signInWithOtp({ email: to, options: { shouldCreateUser: true } });
    setBusy(false);
    if (failed) setError(signInError(failed.message));
    else setSentTo(to);
  };
  const verify = async () => {
    if (!sentTo || code.trim().length < 6 || busy) return;
    setBusy(true);
    setError(null);
    const { error: failed } = await supabase().auth.verifyOtp({ email: sentTo, token: code.trim(), type: "email" });
    setBusy(false);
    // On success the session provider takes over and this screen goes.
    if (failed) setError(signInError(failed.message));
  };

  const field = [styles.field, { borderColor: c.lineControl, color: c.ink, backgroundColor: c.surface }];
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: c.paper }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.body}>
        <Text accessibilityRole="header" style={[styles.title, { color: c.ink }]}>
          Sparehour
        </Text>
        <Text style={[styles.line, { color: c.ink2 }]}>Find the spare hours in your day.</Text>
        {sentTo === null ? (
          <View style={styles.form}>
            <Text style={[styles.label, { color: c.ink2 }]}>Email</Text>
            <TextInput
              accessibilityLabel="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              returnKeyType="send"
              onSubmitEditing={() => void send()}
              style={field}
            />
            <Pressable accessibilityRole="button" onPress={() => void send()} disabled={busy} style={[styles.button, { backgroundColor: c.ink, opacity: busy ? 0.6 : 1 }]}>
              <Text style={[styles.buttonText, { color: c.paper }]}>{busy ? "Sending…" : "Email me a code"}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={[styles.line, { color: c.ink2 }]}>We sent a code to {sentTo}.</Text>
            <Text style={[styles.label, { color: c.ink2 }]}>Code</Text>
            <TextInput
              accessibilityLabel="Code"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              maxLength={6}
              returnKeyType="done"
              onSubmitEditing={() => void verify()}
              style={field}
            />
            <Pressable accessibilityRole="button" onPress={() => void verify()} disabled={busy} style={[styles.button, { backgroundColor: c.ink, opacity: busy ? 0.6 : 1 }]}>
              <Text style={[styles.buttonText, { color: c.paper }]}>{busy ? "Signing in…" : "Sign in"}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setSentTo(null);
                setCode("");
                setError(null);
              }}
              style={styles.quiet}
            >
              <Text style={{ color: c.ink2, fontFamily: font.medium, fontSize: 15 }}>Use another email</Text>
            </Pressable>
          </View>
        )}
        {error && (
          <Text accessibilityRole="alert" style={[styles.error, { color: c.deadline }]}>
            {error}
          </Text>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 56, gap: 8 },
  title: { fontFamily: font.bold, fontSize: 30 },
  line: { fontFamily: font.regular, fontSize: 17, lineHeight: 24 },
  form: { marginTop: 24, gap: 8 },
  label: { fontFamily: font.semibold, fontSize: 14 },
  field: { height: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontFamily: font.medium, fontSize: 17 },
  button: { height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 8 },
  buttonText: { fontFamily: font.semibold, fontSize: 17 },
  quiet: { minHeight: TARGET, justifyContent: "center", alignSelf: "flex-start" },
  error: { marginTop: 12, fontFamily: font.medium, fontSize: 15 },
});
