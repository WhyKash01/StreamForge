import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="home">
      <h1>Welcome to StreamForge</h1>
      <p>Your premium video streaming destination.</p>
      
      <div className="video-grid">
        <Link to="/video/1" className="video-card">
          <h3>Sample Video 1</h3>
        </Link>
        <Link to="/video/2" className="video-card">
          <h3>Sample Video 2</h3>
        </Link>
      </div>
    </div>
  );
}
