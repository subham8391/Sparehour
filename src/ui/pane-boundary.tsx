"use client";
// An in-place boundary (SCREENS.md §21 "Unexpected failure"): a pane that throws while drawing gives way to the error
// panel inside its own frame, and the rest of the screen keeps working — Today's list survives a broken timeline, and
// the other way round. Try again draws the pane again from the same local data. The panel is an island.
import { Component, type ErrorInfo, type ReactNode } from "react";
import { LazyErrorPanel } from "./error-panel-lazy";

interface Props {
  /** What the pane is called, for the eyebrow and the details: "Your day", "Today’s list". */
  name: string;
  /** The build, for Copy details (passed in: src/ui reads no app modules). */
  build: string;
  children: ReactNode;
}

interface State {
  error: unknown;
  failed: boolean;
}

export class PaneBoundary extends Component<Props, State> {
  state: State = { error: null, failed: false };

  static getDerivedStateFromError(error: unknown): State {
    return { error, failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { name, build } = this.props;
    return (
      <LazyErrorPanel
        layout="inline"
        eyebrow={name}
        title={`${name} stopped before it finished drawing.`}
        body="Nothing you saved is lost, and the rest of the screen still works. Try again, and if it happens again, Copy details helps us find it."
        onRetry={() => this.setState({ error: null, failed: false })}
        details={{ what: `“${name}” stopped drawing.`, error: this.state.error, build }}
      />
    );
  }
}
