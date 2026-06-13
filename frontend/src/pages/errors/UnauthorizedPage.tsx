import { Link } from 'react-router-dom';

/** 403 — user lacks permission for the requested route. */
const UnauthorizedPage = () => (
  <div className="text-center">
    <h1 className="text-4xl font-bold text-accent">403</h1>
    <p className="mt-4 text-gray-600">You do not have permission to access this page.</p>
    <Link to="/" className="mt-6 inline-block text-primary hover:underline">
      Return home
    </Link>
  </div>
);

export default UnauthorizedPage;
