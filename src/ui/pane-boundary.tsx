"use client";
// An in-place boundary (SCREENS.md §21 "Unexpected failure"): a pane that throws while drawing gives way to the error
// panel inside its own frame, and the rest of the screen keeps working — Today's list survives a broken timeline, and
// the other way round. Try again draws the pane again from the same local data. The panel is an island fetched
// once a pane has failed (`LazyErrorPanel`): while it arrives, or if it cannot, the pane already says what happened
// in plain words with a way out, so it is never blank.
import { Component, type ErrorInfo, type ReactNode } from "react";
import { LazyErrorPanel } from "./error-panel-lazy";

interface Props {
  /** What the pane is called, for the eyebrow and the details: "Your day", "Today’s list". */
  name: string;
  /** The build, for Copy details (passed in: src/ui reads no app modules). */
  build: string;
  /** What the pane draws (Today's day shown): a failure is that day's, so another one draws the pane afresh. */
  resetKey?: string;
  children: ReactNode;
}

interface State {
  error: unknown;
  failed: boolean;
}

/** The end-to-end suite's way to make a pane fail on purpose: `window.__sparehourFail = "<pane name>"` before load. */
function Tripwire({ name }: { name: string }) {
  if (typeof window !== "undefined" && (window as { __sparehourFail?: string }).__sparehourFail === name) throw new Error(`${name} was made to fail`);
  return null;
}

export class PaneBoundary extends Component<Props, State> {
  state: State = { error: null, failed: false };

  static getDerivedStateFromError(error: unknown): State {
    return { error, failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ error: null, failed: false });
  }

  render() {
    if (!this.state.failed)
      return (
        <>
          <Tripwire name={this.props.name} />
          {this.props.children}
        </>
      );
    const { name, build } = this.props;
    // "<name> stopped before it finished drawing.", inline, with Try again and Copy details (error-panel.tsx `boundaryWords`).
    return <LazyErrorPanel kind="pane" name={name} error={this.state.error} build={build} onRetry={() => this.setState({ error: null, failed: false })} />;
  }
}
