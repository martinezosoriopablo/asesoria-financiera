"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex items-center justify-center min-h-[200px] p-8">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-red-600 mb-2">
              Error inesperado
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {this.state.error?.message || "Algo salió mal"}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm hover:bg-gray-700"
            >
              Intentar de nuevo
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
