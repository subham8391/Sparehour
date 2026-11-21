// The sign-in screen as it is drawn (ONBOARDING.md step 1): Google first where the auth server offers it, as on
// the web's sign-in page ("Continue with Google", then "or"), and the emailed six-digit code. Props in, React
// Native out: who signs in and how is the container's (~/screens/sign-in.tsx).
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from "react-native";
import { Text, TextInput } from "~/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { GOOGLE_MARK, GOOGLE_MARK_VIEWBOX } from "@/features/auth/google-mark";
import { Button } from "~/ui/button";
import { TARGET, font, useColours } from "~/ui/theme";

export interface SignInViewProps {
  /** The auth server offers Google sign-in (asked, never assumed: ~/auth/google-sign-in.ts). */
  google: boolean;
  /** The address a code was sent to; null while the email is still being asked for. */
  sentTo: string | null;
  busy: boolean;
  error: string | null;
  onGoogle: () => void;
  onSend: (email: string) => void;
  onVerify: (code: string) => void;
  onAnotherEmail: () => void;
}

function GoogleMark() {
  return (
    <Svg width={18} height={18} viewBox={GOOGLE_MARK_VIEWBOX} aria-hidden>
      {GOOGLE_MARK.map((shape) => (
        <Path key={shape.fill} fill={shape.fill} d={shape.d} />
      ))}
    </Svg>
  );
}

export function SignInView({ google, sentTo, busy, error, onGoogle, onSend, onVerify, onAnotherEmail }: SignInViewProps) {
  const c = useColours();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

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
            {/* The fast path first when the server offers it; the filled button stays the house path. */}
            {google && (
              <>
                <Button label="Continue with Google" onPress={onGoogle} disabled={busy} block icon={<GoogleMark />} style={styles.google} />
                <View aria-hidden style={styles.or}>
                  <View style={[styles.rule, { backgroundColor: c.line }]} />
                  <Text style={[styles.orText, { color: c.ink3 }]}>or</Text>
                  <View style={[styles.rule, { backgroundColor: c.line }]} />
                </View>
              </>
            )}
            <Text style={[styles.label, { color: c.ink2 }]}>Email</Text>
            <TextInput
              accessibilityLabel="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              returnKeyType="send"
              onSubmitEditing={() => onSend(email)}
              style={field}
            />
            <Pressable accessibilityRole="button" onPress={() => onSend(email)} disabled={busy} style={[styles.button, { backgroundColor: c.ink, opacity: busy ? 0.6 : 1 }]}>
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
              onSubmitEditing={() => onVerify(code)}
              style={field}
            />
            <Pressable accessibilityRole="button" onPress={() => onVerify(code)} disabled={busy} style={[styles.button, { backgroundColor: c.ink, opacity: busy ? 0.6 : 1 }]}>
              <Text style={[styles.buttonText, { color: c.paper }]}>{busy ? "Signing in…" : "Sign in"}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setCode("");
                onAnotherEmail();
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
  title: { fontFamily: font.display, fontSize: 30 },
  line: { fontFamily: font.regular, fontSize: 17, lineHeight: 24 },
  form: { marginTop: 24, gap: 8 },
  google: { minHeight: 52 },
  or: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 8 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  orText: { fontFamily: font.medium, fontSize: 13 },
  label: { fontFamily: font.semibold, fontSize: 14 },
  field: { height: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontFamily: font.medium, fontSize: 17 },
  button: { height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 8 },
  buttonText: { fontFamily: font.semibold, fontSize: 17 },
  quiet: { minHeight: TARGET, justifyContent: "center", alignSelf: "flex-start" },
  error: { marginTop: 12, fontFamily: font.medium, fontSize: 15 },
});
