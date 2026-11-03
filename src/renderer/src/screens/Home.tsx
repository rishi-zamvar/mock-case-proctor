import styles from './Settings.module.css'

export default function Home({ onOpenSettings }: { onOpenSettings(): void }): React.JSX.Element {
  return (
    <main data-screen="home" className={styles.page}>
      <div className={styles.card}>
        <h1>Mock Case Proctor</h1>
        <p className={styles.muted}>Case library coming in Phase 3</p>
        <button data-testid="open-settings" type="button" onClick={onOpenSettings}>
          Settings
        </button>
      </div>
    </main>
  )
}
