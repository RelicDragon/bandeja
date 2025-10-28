interface GenderIndicatorProps {
  gender?: 'MALE' | 'FEMALE' | 'PREFER_NOT_TO_SAY';
  layout?: 'small' | 'normal' | 'big';
  position?: 'bottom-left' | 'bottom-right';
}

export const GenderIndicator = ({ gender, layout = 'normal', position = 'bottom-left' }: GenderIndicatorProps) => {
  const getGenderBgColor = (gender?: 'MALE' | 'FEMALE' | 'PREFER_NOT_TO_SAY') => {
    switch (gender) {
      case 'MALE':
        return 'bg-blue-500 dark:bg-blue-600';
      case 'FEMALE':
        return 'bg-pink-500 dark:bg-pink-600';
      default:
        return 'bg-gray-600 dark:bg-gray-500';
    }
  };

  const getSizeClasses = () => {
    switch (layout) {
      case 'small':
        return 'w-5 h-5 text-xs';
      case 'big':
        return 'w-10 h-10 text-lg';
      default:
        return 'w-5 h-5 text-sm';
    }
  };

  const getPositionClasses = () => {
    switch (position) {
      case 'bottom-right':
        return '-bottom-1 -right-1';
      default:
        return '-bottom-1 -left-1';
    }
  };

  if (gender === 'PREFER_NOT_TO_SAY') {
    return null;
  }

  return (
    <div className={`absolute ${getPositionClasses()} ${getSizeClasses()} rounded-full ${getGenderBgColor(gender)} flex items-center justify-center border-2 border-white dark:border-gray-900`}>
      <i className={`bi ${gender === 'MALE' ? 'bi-gender-male' : 'bi-gender-female'} text-white`}></i>
    </div>
  );
};

