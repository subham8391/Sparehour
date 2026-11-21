// The app's Text and TextInput: React Native's own, drawn in the look's faces. A style names what the text is with
// `font` from ui/theme.ts (`font.medium`, `font.display`, …), as every StyleSheet already does; this puts in the file
// the look on screen draws that in (looks/faces.ts), and redraws when the look's faces change. Every screen imports
// Text and TextInput from here, never from "react-native" (text.test.tsx holds every file to it).
import type { ComponentPropsWithRef } from "react";
import { Text as NativeText, TextInput as NativeTextInput } from "react-native";
import { useFaceLook } from "./looks/face-loader";
import { withFace } from "./looks/faces";

export function Text(props: ComponentPropsWithRef<typeof NativeText>) {
  const look = useFaceLook();
  return <NativeText {...props} style={withFace(props.style, look)} />;
}

export function TextInput(props: ComponentPropsWithRef<typeof NativeTextInput>) {
  const look = useFaceLook();
  return <NativeTextInput {...props} style={withFace(props.style, look)} />;
}
