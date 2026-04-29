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
      // token already handled in api interceptor
      api.get('/auth/me')
        .then(res => setUser(res.data))
        .catch(() => {
          localStorage.removeItem('token');
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
    setUser(user);

    return user;
  };

  const register = async (data) => {
    const res = await api.post('/auth/register', data);
    const { token, user } = res.data;

    localStorage.setItem('token', token);
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