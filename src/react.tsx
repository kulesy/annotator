/**
 * React wrapper around `initAnnotator`. Renders nothing — the annotator UI
 * mounts directly to `document.body` (escapes any container's overflow/clip).
 *
 * Usage:
 *
 *   // src/routes/__root.tsx
 *   import { Annotator } from '@kulesy/annotator/react';
 *
 *   <Annotator
 *     enabled={import.meta.env.VITE_SHOW_ANNOTATOR === 'true'}
 *     endpoint="/api/annotations"
 *     viewIssuesUrl="https://github.com/me/repo/labels/annotation"
 *     accentColor="#ec407a"
 *   />
 */

import { useEffect, useRef } from 'react';
import { initAnnotator, type AnnotatorConfig, type AnnotatorInstance } from './core.js';

export interface AnnotatorProps extends AnnotatorConfig {
  /** Master toggle. Default true. When false, the component does not mount the UI. */
  enabled?: boolean;
}

export function Annotator(props: AnnotatorProps) {
  const instanceRef = useRef<AnnotatorInstance | null>(null);
  // We intentionally re-init when meaningful config changes. Stringify is a
  // pragmatic shallow-deep comparator — these props are small flat objects.
  const configKey = JSON.stringify(props);

  useEffect(() => {
    if (props.enabled === false) return;
    instanceRef.current = initAnnotator(props);
    return () => {
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey]);

  return null;
}

export type { AnnotatorConfig, AnnotatorInstance, Annotation, ElementSnippet } from './core.js';
