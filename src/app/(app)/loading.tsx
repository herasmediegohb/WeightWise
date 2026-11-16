export default function Loading() {
  return (
    <div role="status" aria-label="Loading">
      <div className="skeleton mb-5 h-9 w-48" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="skeleton h-72 rounded-3xl" />
        <div className="skeleton h-56 rounded-3xl" />
        <div className="skeleton h-56 rounded-3xl" />
      </div>
    </div>
  );
}
