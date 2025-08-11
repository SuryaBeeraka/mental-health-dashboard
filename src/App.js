import React, { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import './styles.css';
import ReactMarkdown from 'react-markdown';
import UploadPage from './pages/UploadPage';

function App() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch('/data.json')
      .then((res) => res.json())
      .then((json) => setData(json));
  }, []);

  if (!data) return <p>Loading...</p>;

  return (
    <div className="app-container">
      <h1>Mental Health Dashboard</h1>
      <Routes>
        <Route path="/" element={<CategoryList data={data} />} />
        <Route path="/category/:category" element={<CategoryPage data={data} />} />
        <Route path="/category/:category/:subtopic" element={<CategoryPage data={data} />} />
        <Route path="/upload" element={<UploadPage />} />
      </Routes>
    </div>
  );
}

function CategoryList({ data }) {
  const navigate = useNavigate();
  const categories = Object.keys(data);

  return (
    <div className="category-grid">
      {categories.map((category) => (
        <div
          key={category}
          className="category-card"
          onClick={() => navigate(`/category/${category}`)}
        >
          {category}
        </div>
      ))}
      <div className="category-card upload-link" onClick={() => navigate('/upload')}>
        Upload Patient Note
      </div>
    </div>
  );
}

function CategoryPage({ data }) {
  const navigate = useNavigate();
  const { category, subtopic } = useParams();
  const [searchTerm, setSearchTerm] = useState('');

  const subtopics = data[category];
  const subtopicNames = subtopics ? Object.keys(subtopics) : [];

  if (!subtopics) {
    return <p>Invalid category. <button onClick={() => navigate('/')}>Go Home</button></p>;
  }

  const filteredSubtopics = subtopicNames.filter((name) =>
    name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="dashboard-layout">
      <div className="sidebar">
        <h2>{category}</h2>

        <input
          type="text"
          placeholder="Search..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />

        {filteredSubtopics.length > 0 ? (
          filteredSubtopics.map((sub) => (
            <div
              key={sub}
              className="subtopic"
              onClick={() => navigate(`/category/${category}/${sub}`)}
            >
              {sub}
            </div>
          ))
        ) : (
          <p style={{ fontStyle: 'italic', color: '#777' }}>No matches found</p>
        )}

        <button onClick={() => navigate('/')}>← Back to Categories</button>
      </div>

      <div className="info-panel">
        {subtopic ? (
          <>
            <ReactMarkdown>{subtopics[subtopic]}</ReactMarkdown>
          </>
        ) : (
          <p>Please select a topic on the left to view details.</p>
        )}
      </div>
    </div>
  );
}

export default App;