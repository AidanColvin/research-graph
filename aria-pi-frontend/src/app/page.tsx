'use client';
import { useState } from 'react';
import PipelineStepper from '@/components/pipeline/PipelineStepper';
import VerificationCenter from '@/components/review/VerificationCenter';
import { runPipeline } from '@/lib/api';

export default function Home() {
  const [stage, setStage] = useState('Overview');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleRun = async () => {
    setLoading(true);
    setStage('Profiling');
    try {
      const result = await runPipeline("Oncology");
      setData(result.data);
      setStage('Verification');
    } catch (error) {
      console.error(error);
      setStage('Overview');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <PipelineStepper currentStage={stage} />
      
      <div className="mt-12 max-w-4xl mx-auto">
        {stage === 'Overview' && (
          <button 
            onClick={handleRun}
            className="bg-blue-600 text-white px-6 py-3 rounded-md font-semibold hover:bg-blue-700"
          >
            {loading ? 'Running Engine...' : 'Run ARIA-PI Pipeline'}
          </button>
        )}
        
        {stage === 'Verification' && data && (
          <div className="bg-white p-6 rounded-lg shadow mt-8">
            <h2 className="text-xl font-bold mb-4">Profile Generated: {data.company_name}</h2>
            <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
              {JSON.stringify(data, null, 2)}
            </pre>
            <VerificationCenter />
          </div>
        )}
      </div>
    </main>
  );
}
