import './Skeleton.css'

export function Skeleton({ width = '100%', height = '1rem', count = 1, className = '' }) {
  if (count > 1) {
    return (
      <div className={`skeleton-group ${className}`}>
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            className="skeleton-block"
            style={{ width, height }}
          />
        ))}
      </div>
    )
  }
  return <span className={`skeleton-block ${className}`} style={{ width, height }} />
}
