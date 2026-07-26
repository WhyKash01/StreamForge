import { useParams, Link } from 'react-router-dom';

export default function Video() {
  const { id } = useParams();

  return (
    <div className="video-page">
      <Link to="/">&larr; Back to Home</Link>
      
      <div className="player-placeholder">
        <h2>Playing Video {id}</h2>
        <div style={{ background: '#333', width: '100%', height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '20px' }}>
          <p>Video Player Placeholder</p>
        </div>
      </div>
    </div>
  );
}
