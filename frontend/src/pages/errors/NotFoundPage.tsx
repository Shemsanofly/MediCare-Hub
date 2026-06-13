import { Link } from 'react-router-dom';

/** 404 — route not found. */
const NotFoundPage = () => (
  <div className="text-center">
    <h1 className="text-4xl font-bold text-primary">404</h1>
    <p className="mt-4 text-gray-600">The page you are looking for does not exist.</p>
    <Link to="/" className="mt-6 inline-block text-primary hover:underline">
      Return home
    </Link>
  </div>
);

export default NotFoundPage;
