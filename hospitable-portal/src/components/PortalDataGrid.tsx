"use client";

import * as React from 'react';
import { DataGridPro, DataGridProProps, GridToolbar } from '@mui/x-data-grid-pro';
import { Box, Paper } from '@mui/material';

export type PortalDataGridProps = Omit<DataGridProProps, 'slots' | 'slotProps'> & {
  height?: number | string;
};

export const PortalDataGrid: React.FC<PortalDataGridProps> = ({ height, ...rest }) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [autoHeight, setAutoHeight] = React.useState<number | undefined>(undefined);

  React.useEffect(() => {
    if (height) return; // explicit height provided
    function calc() {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const vh = window.innerHeight;
      const desired = Math.max(200, vh - rect.top - 16); // 16px bottom margin
      setAutoHeight(desired);
    }
    calc();
    window.addEventListener('resize', calc);
    window.addEventListener('orientationchange', calc);
    return () => {
      window.removeEventListener('resize', calc);
      window.removeEventListener('orientationchange', calc);
    };
  }, [height]);

  const finalHeight = height ?? autoHeight;

  return (
    <Paper ref={containerRef} elevation={0} sx={{ flex: 1, width: '100%', p: 1, display: 'flex', flexDirection: 'column', gap: 1, minHeight: 0 }}>
      <Box sx={{ flex: 1, minHeight: 0, height: finalHeight ? finalHeight : undefined }}>
        {finalHeight && (
          <DataGridPro
            disableRowSelectionOnClick
            density="compact"
            pageSizeOptions={[25, 50, 100]}
            initialState={{
              pagination: { paginationModel: { pageSize: 25, page: 0 } },
            }}
            slots={{ toolbar: GridToolbar }}
            {...rest}
            style={{ height: finalHeight, maxHeight: finalHeight, display: 'flex' }}
          />
        )}
      </Box>
    </Paper>
  );
};

export default PortalDataGrid;
