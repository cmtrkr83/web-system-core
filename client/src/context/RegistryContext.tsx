import React, { createContext, useContext, useState, ReactNode } from "react";

export interface Student {
  id: string;
  name: string;
  tc: string;
  schoolId: string;
  salon: string;
  class: string; // Şube
}

export interface School {
  id: string;
  name: string;
  districtId: string;
  code: string;
}

export interface District {
  id: string;
  name: string;
}

interface RegistryContextType {
  districts: District[];
  schools: School[];
  students: Student[];
  isLoaded: boolean;
  setRegistryData: (districts: District[], schools: School[], students: Student[]) => void;
  resetRegistry: () => void;
}

const RegistryContext = createContext<RegistryContextType | undefined>(undefined);

export function RegistryProvider({ children }: { children: ReactNode }) {
  const [districts, setDistricts] = useState<District[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const setRegistryData = (d: District[], s: School[], st: Student[]) => {
    setDistricts(d);
    setSchools(s);
    setStudents(st);
    setIsLoaded(true);
  };

  const resetRegistry = () => {
    setDistricts([]);
    setSchools([]);
    setStudents([]);
    setIsLoaded(false);
  };

  return (
    <RegistryContext.Provider value={{ districts, schools, students, isLoaded, setRegistryData, resetRegistry }}>
      {children}
    </RegistryContext.Provider>
  );
}

export function useRegistry() {
  const context = useContext(RegistryContext);
  if (context === undefined) {
    throw new Error("useRegistry must be used within a RegistryProvider");
  }
  return context;
}
