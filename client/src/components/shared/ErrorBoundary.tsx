import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';
import Button from '../ui/Button';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled runtime error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-white rounded-2xl p-8 max-w-md shadow-lg border border-gray-100 flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-6 shadow-sm">
              <AlertOctagon size={32} className="text-blue-500" />
            </div>
            
            <h2 className="text-2xl font-black text-[#0F172A] tracking-tight mb-2">Something went wrong</h2>
            <p className="text-sm text-[#5f5e5e] mb-6 leading-relaxed">
              An unexpected application error occurred. We have logged this error and are looking into it.
            </p>

            <div className="w-full bg-blue-50/50 border border-blue-100 rounded-xl p-3.5 mb-6 text-left font-mono text-[10px] text-blue-600 max-h-40 overflow-y-auto break-all">
              {this.state.error?.toString()}
            </div>

            <Button onClick={this.handleReset} icon={<RotateCcw size={14} />}>
              Return to Homepage
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
