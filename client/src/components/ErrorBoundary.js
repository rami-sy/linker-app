import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // يمكنك إرسال الخطأ إلى خدمة مراقبة مثل Sentry
    console.error('Error caught by boundary:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleGoHome = () => {
    this.handleReset();
    router.replace('/');
  };

  handleCopyDetails = async () => {
    if (!__DEV__) return;
    const details = `${this.state.error?.toString?.() || ''}\n${this.state.errorInfo?.componentStack || ''}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(details);
      }
    } catch (error) {
      console.warn('Failed to copy error details', error);
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.content}>
            <Text style={styles.title}>😔 عذراً، حدث خطأ</Text>
            <Text style={styles.message}>
              حدث خطأ غير متوقع. نعمل على إصلاحه.
            </Text>
            
            {__DEV__ && this.state.error && (
              <View style={styles.errorDetails}>
                <Text style={styles.errorText}>
                  {this.state.error.toString()}
                </Text>
                {this.state.errorInfo && (
                  <Text style={styles.errorStack}>
                    {this.state.errorInfo.componentStack}
                  </Text>
                )}
              </View>
            )}
            
            <TouchableOpacity
              style={styles.button}
              onPress={this.handleReset}
            >
              <Text style={styles.buttonText}>إعادة المحاولة</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={this.handleGoHome}
            >
              <Text style={styles.buttonText}>الرجوع للرئيسية</Text>
            </TouchableOpacity>
            {__DEV__ && (
              <TouchableOpacity
                style={[styles.button, styles.ghostButton]}
                onPress={this.handleCopyDetails}
              >
                <Text style={styles.buttonText}>نسخ تفاصيل الخطأ</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#12141b',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    backgroundColor: '#1e2433',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#f6f8f9',
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#a0a0a0',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  errorDetails: {
    backgroundColor: '#2a2f3e',
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
    width: '100%',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 14,
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  errorStack: {
    color: '#ff9999',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  button: {
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 200,
    marginTop: 10,
  },
  secondaryButton: {
    backgroundColor: '#0f766e',
  },
  ghostButton: {
    backgroundColor: '#334155',
  },
  buttonText: {
    color: '#f6f8f9',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default ErrorBoundary;


