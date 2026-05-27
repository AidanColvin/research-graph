'use client';
import { useState } from 'react';
import PipelineStepper from '@/components/pipeline/PipelineStepper';
import VerificationCenter from '@/components/review/VerificationCenter';

export default function Home() {
  const [stage, setStage] = useState('VERIFICATION');

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <PipelineStepper currentStage={stage} />
      <div className="mt-12 max-w-4xl mx-auto">
        {stage === 'VERIFICATION' && <VerificationCenter />}
      </div>
    </main>
  );
}
