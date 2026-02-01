'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function AdminPage() {
    const [lat, setLat] = useState<string>('');
    const [lng, setLng] = useState<string>('');
    const [message, setMessage] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Fetch current config
        fetch('http://localhost:8000/api/admin/config')
            .then(res => res.json())
            .then(data => {
                if (data.start_location) {
                    setLat(data.start_location.lat.toString());
                    setLng(data.start_location.lng.toString());
                }
                setLoading(false);
            })
            .catch(err => {
                setMessage('Error loading config: ' + err.message);
                setLoading(false);
            });
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage('Updating...');

        try {
            const res = await fetch('http://localhost:8000/api/admin/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lat: parseFloat(lat),
                    lng: parseFloat(lng)
                })
            });
            const data = await res.json();
            if (data.success) {
                setMessage('✅ Start location updated successfully!');
            } else {
                setMessage('❌ Failed to update');
            }
        } catch (err: any) {
            setMessage('❌ Error: ' + err.message);
        }
    };

    return (
        <div className="min-h-screen p-8 bg-gray-50 text-black font-sans">
            <div className="max-w-md mx-auto bg-white p-6 rounded-lg shadow-md">
                <h1 className="text-2xl font-bold mb-6">Admin Configuration</h1>

                <div className="mb-6">
                    <Link href="/" className="text-blue-500 hover:underline">← Back to Home</Link>
                </div>

                {loading ? (
                    <p>Loading configuration...</p>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <h2 className="text-lg font-semibold mb-2">Default Start Location</h2>
                            <p className="text-sm text-gray-600 mb-4">
                                This sets the starting point for new tours when no location is provided.
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Latitude</label>
                            <input
                                type="number"
                                step="any"
                                value={lat}
                                onChange={(e) => setLat(e.target.value)}
                                className="w-full p-2 border rounded"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Longitude</label>
                            <input
                                type="number"
                                step="any"
                                value={lng}
                                onChange={(e) => setLng(e.target.value)}
                                className="w-full p-2 border rounded"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition"
                        >
                            Save Changes
                        </button>

                        {message && (
                            <p className={`text-sm mt-4 p-2 rounded ${message.includes('Error') || message.includes('Failed') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                {message}
                            </p>
                        )}
                    </form>
                )}

                <div className="mt-8 pt-6 border-t">
                    <h3 className="text-sm font-semibold text-gray-500 mb-2">Common Coordinates:</h3>
                    <ul className="text-sm space-y-1 text-gray-600">
                        <li className="flex justify-between">
                            <span>Providence, RI</span>
                            <span className="font-mono text-xs">41.8240, -71.4128</span>
                        </li>
                        <li className="flex justify-between">
                            <span>Boston, MA</span>
                            <span className="font-mono text-xs">42.3601, -71.0589</span>
                        </li>
                        <li className="flex justify-between">
                            <span>New York, NY</span>
                            <span className="font-mono text-xs">40.7128, -74.0060</span>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
