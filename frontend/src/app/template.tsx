/** Route transition: pure CSS so the page paints immediately and never waits for hydration. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
