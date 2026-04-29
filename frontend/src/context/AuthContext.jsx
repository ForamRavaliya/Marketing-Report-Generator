import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api'; // ✅ USE THIS

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');

    if (token) {
      api.get('/auth/me')
        .then(res => setUser(res.data))
        .catch(() => {
          localStorage.removeItem('token');
          setUser(null);   // ✅ ADD THIS LINE
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const { token, user } = res.data;

    localStorage.setItem('token', token);
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(user);

    return user;
  };

  const register = async (data) => {
    const res = await api.post('/auth/register', data);
    const { token, user } = res.data;

    localStorage.setItem('token', token);
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(user);

    return user;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};