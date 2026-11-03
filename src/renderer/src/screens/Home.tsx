export default function Home({ onOpenSettings }: { onOpenSettings(): void }): React.JSX.Element {
  return (
    <main data-screen="home">
      <h1>Mock Case Proctor</h1>
      <p>Case library coming in Phase 3</p>
      <button data-testid="open-settings" type="button" onClick={onOpenSettings}>
        Settings
      </button>
    </main>
  )
}
